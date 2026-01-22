const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const app = express();
const PORT = 3001;

// Я настраиваю CORS для разрешения запросов с фронтенда
app.use(cors({
    origin: 'http://localhost:5500', // Разрешаю запросы с этого адреса
    credentials: true // Разрешаю передачу куки и авторизационных заголовков
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../front'))); // Раздаю статические файлы

// Подключаюсь к PostgreSQL
const pool = new Pool({
    user: 'lusouser',
    host: 'localhost',
    database: 'lusobeauty',
    password: 'password123',
    port: 5432,
});

const JWT_SECRET = 'luso-secret-key-2024'; // Секретный ключ для JWT

// Middleware для проверки токена - я проверяю каждый защищенный запрос
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Нет токена' });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId; // Сохраняю ID пользователя в запрос
        next();
    } catch (err) {
        res.status(401).json({ error: 'Неверный токен' });
    }
};

// Инициализация базы данных - я создаю таблицы при старте сервера
async function initDatabase() {
    try {
        // Создаю таблицы если их нет
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                category VARCHAR(50),
                description TEXT,
                image VARCHAR(500),
                tags TEXT[] DEFAULT '{}'
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cart_items (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                quantity INTEGER DEFAULT 1,
                UNIQUE(user_id, product_id)
            )
        `);

        // НОВЫЕ таблицы для рекомендаций - я добавил их для улучшения функционала
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                total_amount DECIMAL(10,2) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                quantity INTEGER NOT NULL,
                price DECIMAL(10,2) NOT NULL
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS favorites (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, product_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_views (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log(' Таблицы готовы');

        // Проверяю есть ли товары
        const result = await pool.query('SELECT COUNT(*) FROM products');
        if (parseInt(result.rows[0].count) === 0) {
            // Обновляем данные товаров с тегами
            for (const product of products) {
                await pool.query(
                    'INSERT INTO products (name, price, category, description, image, tags) VALUES ($1, $2, $3, $4, $5, $6)',
                    product
                );
            }
            console.log('✅ Товары добавлены');
        }
    } catch (err) {
        console.error('Ошибка базы данных:', err);
    }
}

// API маршруты

// 1. Регистрация - я обрабатываю создание нового пользователя
app.post('/api/register', async (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10); // Хэширую пароль для безопасности
        const result = await pool.query(
            'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name',
            [email, hashedPassword, name]
        );

        const user = result.rows[0];
        const token = jwt.sign({ userId: user.id }, JWT_SECRET); // Создаю JWT токен

        res.json({
            success: true,
            token,
            user
        });
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).json({ error: 'Email уже используется' });
        } else {
            res.status(500).json({ error: 'Ошибка сервера' });
        }
    }
});

// 2. Вход - я проверяю учетные данные и выдаю токен
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password); // Сравниваю хэши

        if (!validPassword) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 3. Проверка токена - я валидирую JWT токен
app.get('/api/check-auth', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, name FROM users WHERE id = $1',
            [req.userId]
        );

        res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 4. Получить все товары
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id');
        res.json({
            success: true,
            products: result.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 5. Получить товар по ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Товар не найден' });
        }

        res.json({
            success: true,
            product: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 6. Получить товары по категории
app.get('/api/products/category/:category', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM products WHERE category = $1 ORDER BY id',
            [req.params.category]
        );
        res.json({
            success: true,
            products: result.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 7. Рекомендации - случайные товары
app.get('/api/recommendations', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY RANDOM() LIMIT 6');
        res.json({
            success: true,
            products: result.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 8. Рекомендации: Популярные товары (чаще всего покупают)
app.get('/api/recommendations/popular', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, COUNT(oi.product_id) as purchase_count
            FROM products p
            LEFT JOIN order_items oi ON p.id = oi.product_id
            GROUP BY p.id
            ORDER BY purchase_count DESC, RANDOM()
            LIMIT 6
        `);

        res.json({
            success: true,
            products: result.rows
        });
    } catch (err) {
        console.error('Popular error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 9. Рекомендации: Чаще всего в избранном
app.get('/api/recommendations/favorites', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, COUNT(f.product_id) as favorite_count
            FROM products p
            LEFT JOIN favorites f ON p.id = f.product_id
            GROUP BY p.id
            ORDER BY favorite_count DESC, RANDOM()
            LIMIT 6
        `);

        res.json({
            success: true,
            products: result.rows
        });
    } catch (err) {
        console.error('Favorites error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 10. Рекомендации: Для вас - персонализированные рекомендации
app.get('/api/recommendations/personal', authMiddleware, async (req, res) => {
    try {
        // 1. Получаем категории купленных пользователем товаров
        const userCategories = await pool.query(`
            SELECT DISTINCT p.category 
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            WHERE o.user_id = $1
        `, [req.userId]);

        // 2. Если есть покупки - рекомендую товары из тех же категорий
        if (userCategories.rows.length > 0) {
            const categories = userCategories.rows.map(r => r.category);
            const result = await pool.query(`
                SELECT p.* 
                FROM products p
                WHERE p.category = ANY($1) 
                AND p.id NOT IN (
                    SELECT oi.product_id 
                    FROM order_items oi
                    JOIN orders o ON oi.order_id = o.id
                    WHERE o.user_id = $2
                )
                ORDER BY RANDOM()
                LIMIT 6
            `, [categories, req.userId]);

            return res.json({
                success: true,
                products: result.rows,
                type: 'personal'
            });
        }

        // 3. Если нет покупок - рекомендую популярные товары
        const popularResult = await pool.query(`
            SELECT p.*, COUNT(oi.product_id) as purchase_count
            FROM products p
            LEFT JOIN order_items oi ON p.id = oi.product_id
            GROUP BY p.id
            ORDER BY purchase_count DESC, RANDOM()
            LIMIT 6
        `);

        res.json({
            success: true,
            products: popularResult.rows,
            type: 'popular_fallback'
        });
    } catch (err) {
        console.error('Personal recommendations error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 11. Получить корзину пользователя
app.get('/api/cart', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ci.*, p.name, p.price, p.image 
            FROM cart_items ci 
            JOIN products p ON ci.product_id = p.id 
            WHERE ci.user_id = $1
        `, [req.userId]);

        res.json({
            success: true,
            cart: result.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 12. Добавить в корзину - я использую UPSERT для обновления количества
app.post('/api/cart', authMiddleware, async (req, res) => {
    const { productId, quantity } = req.body;

    if (!productId) {
        return res.status(400).json({ error: 'ID товара обязателен' });
    }

    try {
        await pool.query(`
            INSERT INTO cart_items (user_id, product_id, quantity) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (user_id, product_id) 
            DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
        `, [req.userId, productId, quantity || 1]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 13. Удалить из корзины
app.delete('/api/cart/:productId', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2',
            [req.userId, req.params.productId]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 14. Очистить корзину
app.delete('/api/cart', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 15. Добавить в избранное
app.post('/api/favorites', authMiddleware, async (req, res) => {
    const { productId } = req.body;

    if (!productId) {
        return res.status(400).json({ error: 'ID товара обязателен' });
    }

    try {
        await pool.query(
            'INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.userId, productId]
        );

        res.json({ success: true, message: 'Добавлено в избранное' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 16. Удалить из избранного
app.delete('/api/favorites/:productId', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2',
            [req.userId, req.params.productId]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 17. Получить избранное пользователя
app.get('/api/favorites', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.* 
            FROM favorites f 
            JOIN products p ON f.product_id = p.id 
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC
        `, [req.userId]);

        res.json({
            success: true,
            favorites: result.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 18. Проверить, в избранном ли товар
app.get('/api/favorites/:productId', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM favorites WHERE user_id = $1 AND product_id = $2',
            [req.userId, req.params.productId]
        );

        res.json({
            success: true,
            isFavorite: result.rows.length > 0
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 19. Зафиксировать просмотр товара - для сбора данных о поведении
app.post('/api/products/:id/view', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO product_views (user_id, product_id) VALUES ($1, $2)',
            [req.userId, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        // Игнорирую ошибки при записи просмотров, чтобы не мешать пользователю
        res.json({ success: true });
    }
});

// 20. Оформление заказа - сложная транзакция
app.post('/api/orders', authMiddleware, async (req, res) => {
    const { total, items } = req.body;

    try {
        // Получаю корзину пользователя
        const cartResult = await pool.query(`
            SELECT ci.*, p.price 
            FROM cart_items ci 
            JOIN products p ON ci.product_id = p.id 
            WHERE ci.user_id = $1
        `, [req.userId]);

        if (cartResult.rows.length === 0) {
            return res.status(400).json({ error: 'Корзина пуста' });
        }

        // Создаю заказ
        const orderResult = await pool.query(
            'INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING id',
            [req.userId, total, 'pending']
        );

        const orderId = orderResult.rows[0].id;

        // Добавляю товары заказа
        for (const item of cartResult.rows) {
            await pool.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
                [orderId, item.product_id, item.quantity, item.price]
            );
        }

        // Очищаю корзину после успешного оформления
        await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.userId]);

        res.json({
            success: true,
            orderId,
            message: 'Заказ оформлен!'
        });
    } catch (err) {
        console.error('Order error:', err);
        res.status(500).json({ error: 'Ошибка оформления заказа' });
    }
});

// Статические файлы и HTML маршруты
// Я отдаю HTML файлы для разных страниц приложения

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../front/index.html'));
});

app.get('/catalog.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../front/catalog.html'));
});

app.get('/cart.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../front/cart.html'));
});

app.get('/about.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../front/about.html'));
});

app.get('/contacts.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../front/contacts.html'));
});

app.get('/product.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../front/product.html'));
});

app.get('/favorites.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../front/favorites.html'));
});

// Запуск сервера
app.listen(PORT, async () => {
    console.log(` Сервер запущен: http://localhost:${PORT}`);
    await initDatabase(); // Инициализирую БД при запуске
});