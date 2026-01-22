const API_BASE = 'http://localhost:3001/api'; // Базовый URL моего API
let currentUser = null; // Текущий пользователь
let token = localStorage.getItem('token'); // Токен из localStorage

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================

// Проверка авторизации - я проверяю, действителен ли токен
async function checkAuth() {
    if (!token) {
        updateAuthUI();
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}/check-auth`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                currentUser = data.user;
                updateAuthUI();
                updateCartCount();
                return true;
            }
        }

        // Если токен невалидный - выхожу
        logout();
        return false;
    } catch (error) {
        console.log('Ошибка проверки авторизации:', error);
        return false;
    }
}

// Обновление интерфейса авторизации - переключаю между кнопками входа и меню пользователя
function updateAuthUI() {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    const userName = document.getElementById('userName');

    if (!authButtons || !userMenu) return;

    if (currentUser) {
        authButtons.style.display = 'none';
        userMenu.style.display = 'flex';
        if (userName) {
            userName.textContent = currentUser.name;
        }
    } else {
        authButtons.style.display = 'flex';
        userMenu.style.display = 'none';
    }
}

// Показываю модальное окно авторизации
function showAuthModal(mode = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) {
        console.error('Модальное окно не найдено!');
        return;
    }

    const title = document.getElementById('authModalTitle');
    const registerFields = document.getElementById('registerFields');
    const switchText = document.getElementById('authSwitchText');
    const nameInput = document.getElementById('name');

    // ВАЖНО: Сначала убираю required у скрытых полей, чтобы не мешали при логине
    if (nameInput) {
        nameInput.required = false;
    }

    if (mode === 'register') {
        if (title) title.textContent = 'Регистрация';
        if (registerFields) registerFields.style.display = 'block';
        if (nameInput) {
            nameInput.required = true; // Для регистрации имя обязательно
        }
        if (switchText) {
            switchText.innerHTML = 'Уже есть аккаунт? <a href="#" onclick="switchAuthMode(\'login\')">Войти</a>';
        }
    } else {
        if (title) title.textContent = 'Вход в аккаунт';
        if (registerFields) registerFields.style.display = 'none';
        if (switchText) {
            switchText.innerHTML = 'Нет аккаунта? <a href="#" onclick="switchAuthMode(\'register\')">Зарегистрироваться</a>';
        }
    }

    modal.style.display = 'block';
}

// Закрываю модальное окно
function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'none';
    }

    const form = document.getElementById('authForm');
    if (form) {
        form.reset();
        // Убираю required у всех полей при закрытии
        const nameInput = document.getElementById('name');
        if (nameInput) {
            nameInput.required = false;
        }
    }
}

// Переключаю режим между логином и регистрацией
function switchAuthMode(mode) {
    showAuthModal(mode);
}

// Обработка авторизации - отправляю данные на сервер
async function handleAuth(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const nameInput = document.getElementById('name');
    const isRegister = document.getElementById('registerFields').style.display !== 'none';

    if (!email || !password) {
        alert('Введите email и пароль');
        return;
    }

    if (isRegister && (!nameInput || !nameInput.value)) {
        alert('Введите имя');
        return;
    }

    const data = {
        email: email.trim(),
        password: password.trim()
    };

    if (isRegister) {
        data.name = nameInput.value.trim();
    }

    try {
        const endpoint = isRegister ? 'register' : 'login';
        const response = await fetch(`${API_BASE}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            // Сохраняю токен в localStorage
            token = result.token;
            currentUser = result.user;
            localStorage.setItem('token', token);

            // Закрываю модалку
            closeAuthModal();

            // Обновляю интерфейс
            updateAuthUI();
            updateCartCount();

            // Показываю сообщение
            alert(isRegister ? '✅ Регистрация успешна!' : '✅ Вход выполнен!');

            // Если на странице корзины, обновляю ее
            if (window.location.pathname.includes('cart.html')) {
                await loadCart();
            }

            // Если на странице избранного, обновляю
            if (window.location.pathname.includes('favorites.html')) {
                await loadFavorites();
            }

            // Обновляю рекомендации
            if (window.location.pathname.includes('index.html')) {
                await loadRecommendations();
            }
        } else {
            alert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка сети:', error);
        alert('❌ Ошибка сети');
    }
}

// ==================== РЕКОМЕНДАЦИИ ====================

let currentRecommendationType = 'popular';

// Загружаю рекомендации для главной страницы
async function loadRecommendations() {
    const grid = document.getElementById('recommendationsGrid');
    if (!grid) return;

    try {
        // ПОПУЛЯРНЫЕ ТОВАРЫ - показываю ВСЕГДА (и авторизованным, и нет)
        const response = await fetch(`${API_BASE}/recommendations/popular`);
        const data = await response.json();

        if (data.success && data.products) {
            displayProducts(grid, data.products, 'popular');
        }
    } catch (error) {
        console.error('Ошибка загрузки рекомендаций:', error);
        grid.innerHTML = '<p>Ошибка загрузки товаров</p>';
    }
}

// Загружаю рекомендации определенного типа
async function loadRecommendationsByType(type = 'popular') {
    currentRecommendationType = type;

    const grid = document.getElementById('recommendationsGrid');
    if (!grid) return;

    try {
        let endpoint = '';
        let authRequired = false;

        switch (type) {
            case 'popular':
                endpoint = '/recommendations/popular';
                break;
            case 'favorites':
                endpoint = '/recommendations/favorites';
                break;
            case 'personal':
                endpoint = '/recommendations/personal';
                authRequired = true; // Персональные рекомендации требуют авторизации
                break;
            default:
                endpoint = '/recommendations';
        }

        let headers = {
            'Content-Type': 'application/json'
        };

        if (authRequired && token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, { headers });
        const data = await response.json();

        if (data.success && data.products) {
            displayProducts(grid, data.products, type);

            // Активирую соответствующую кнопку
            document.querySelectorAll('.recommendations-tabs button').forEach(btn => {
                btn.classList.remove('active');
            });
            const activeBtn = document.querySelector(`.recommendations-tabs button[onclick*="${type}"]`);
            if (activeBtn) {
                activeBtn.classList.add('active');
            }
        }
    } catch (error) {
        console.error(`Ошибка загрузки рекомендаций ${type}:`, error);
        grid.innerHTML = '<p>Ошибка загрузки товаров</p>';
    }
}

// Отображаю товары в сетке
function displayProducts(container, products, type = 'default') {
    if (!container || !products) return;

    container.innerHTML = products.map((product, index) => {
        const isPopular = type === 'popular' && index < 3;
        const tags = product.tags || [];

        return `
            <div class="product-card">
                <div class="product-image">
                    <img src="${product.image || 'https://via.placeholder.com/300x300'}" alt="${product.name}">
                    ${isPopular ? '<div class="popular-badge"><i class="fas fa-fire"></i> Популярное</div>' : ''}
                    <button class="favorite-icon" onclick="toggleFavorite(${product.id}, this)">
                        ${isFavorite(product.id) ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>'}
                    </button>
                </div>
                <div class="product-info">
                    <h3>${product.name}</h3>
                    <div class="category-badge">${getCategoryName(product.category)}</div>
                    <p>${product.description}</p>
                    
                    ${tags.length > 0 ? `
                        <div class="product-tags">
                            ${tags.slice(0, 3).map(tag => `<span>${tag}</span>`).join('')}
                        </div>
                    ` : ''}
                    
                    <p class="product-price">${product.price} ₽</p>
                    <button class="btn-primary" onclick="addToCart(${product.id})">В корзину</button>
                    <button class="btn-secondary" onclick="viewProduct(${product.id})">Подробнее</button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== КАТАЛОГ ====================

let allProducts = []; // Кэширую все товары для фильтрации

// Загружаю каталог товаров
async function loadCatalog() {
    const grid = document.getElementById('catalogGrid');
    if (!grid) return;

    try {
        const response = await fetch(`${API_BASE}/products`);
        const data = await response.json();

        if (data.success && data.products) {
            allProducts = data.products;
            displayCatalogProducts(allProducts);
        }
    } catch (error) {
        console.error('Ошибка загрузки каталога:', error);
        grid.innerHTML = '<p>Ошибка загрузки каталога</p>';
    }
}

// Отображаю товары каталога
function displayCatalogProducts(products) {
    const grid = document.getElementById('catalogGrid');
    if (!grid) return;

    grid.innerHTML = products.map(product => {
        const tags = product.tags || [];

        return `
            <div class="product-card">
                <div class="product-image">
                    <img src="${product.image || 'https://via.placeholder.com/300x300'}" alt="${product.name}">
                    <button class="favorite-icon" onclick="toggleFavorite(${product.id}, this)">
                        ${isFavorite(product.id) ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>'}
                    </button>
                </div>
                <div class="product-info">
                    <h3>${product.name}</h3>
                    <div class="category-badge">${getCategoryName(product.category)}</div>
                    <p>${product.description}</p>
                    
                    ${tags.length > 0 ? `
                        <div class="product-tags">
                            ${tags.slice(0, 3).map(tag => `<span>${tag}</span>`).join('')}
                        </div>
                    ` : ''}
                    
                    <p class="product-price">${product.price} ₽</p>
                    <button class="btn-primary" onclick="addToCart(${product.id})">В корзину</button>
                    <button class="btn-secondary" onclick="viewProduct(${product.id})">Подробнее</button>
                </div>
            </div>
        `;
    }).join('');
}

// Фильтрую товары по категории и сортирую
async function filterProducts() {
    const category = document.getElementById('categoryFilter')?.value;
    const sort = document.getElementById('sortFilter')?.value;

    let filtered = [...allProducts];

    // Фильтрация по категории
    if (category) {
        filtered = filtered.filter(product => product.category === category);
    }

    // Сортировка
    switch (sort) {
        case 'price_asc':
            filtered.sort((a, b) => a.price - b.price);
            break;
        case 'price_desc':
            filtered.sort((a, b) => b.price - a.price);
            break;
        case 'name':
            filtered.sort((a, b) => a.name.localeCompare(b.name));
            break;
    }

    displayCatalogProducts(filtered);
}

// Преобразую английские названия категорий в русские
function getCategoryName(category) {
    const categories = {
        'face': 'Уход за лицом',
        'lips': 'Помады и блески',
        'eyes': 'Для глаз'
    };
    return categories[category] || category;
}

// ==================== ИЗБРАННОЕ ====================

let favoriteProducts = new Set(); // Храню ID избранных товаров в памяти

// Загружаю избранное пользователя
async function loadFavorites() {
    const container = document.getElementById('favoritesContainer');
    if (!container) return;

    // Проверяю авторизацию
    const isAuth = await checkAuth();
    if (!isAuth) {
        container.innerHTML = `
            <div class="empty-favorites">
                <h2><i class="fas fa-lock"></i> Требуется авторизация</h2>
                <p>Войдите в аккаунт для просмотра избранного</p>
                <button class="btn-primary" onclick="showAuthModal()">Войти</button>
            </div>
        `;
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/favorites`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success && data.favorites && data.favorites.length > 0) {
            container.innerHTML = `
                <div class="products-grid">
                    ${data.favorites.map(product => `
                        <div class="product-card">
                            <div class="product-image">
                                <img src="${product.image || 'https://via.placeholder.com/300x300'}" alt="${product.name}">
                                <button class="favorite-icon active" onclick="toggleFavorite(${product.id}, this)">
                                    <i class="fas fa-heart"></i>
                                </button>
                            </div>
                            <div class="product-info">
                                <h3>${product.name}</h3>
                                <div class="category-badge">${getCategoryName(product.category)}</div>
                                <p>${product.description}</p>
                                <p class="product-price">${product.price} ₽</p>
                                <button class="btn-primary" onclick="addToCart(${product.id})">В корзину</button>
                                <button class="btn-secondary" onclick="viewProduct(${product.id})">Подробнее</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="empty-favorites">
                    <h2><i class="fas fa-heart"></i> Избранное пусто</h2>
                    <p>Добавляйте товары в избранное, чтобы вернуться к ним позже</p>
                    <button class="btn-primary" onclick="window.location.href='catalog.html'">Перейти в каталог</button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Ошибка загрузки избранного:', error);
        container.innerHTML = '<p>Ошибка загрузки избранного</p>';
    }
}

// Переключаю состояние "избранного" у товара
async function toggleFavorite(productId, button) {
    if (!currentUser) {
        showAuthModal();
        return;
    }

    try {
        // Проверяю текущий статус
        const checkResponse = await fetch(`${API_BASE}/favorites/${productId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const checkData = await checkResponse.json();
        const isCurrentlyFavorite = checkData.success && checkData.isFavorite;

        if (isCurrentlyFavorite) {
            // Удаляю из избранного
            await fetch(`${API_BASE}/favorites/${productId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (button) {
                button.innerHTML = '<i class="far fa-heart"></i>';
                button.classList.remove('active');
            }

            // Обновляю локальный кэш
            favoriteProducts.delete(productId);

            // Если на странице избранного, обновляю список
            if (window.location.pathname.includes('favorites.html')) {
                await loadFavorites();
            }

        } else {
            // Добавляю в избранное
            await fetch(`${API_BASE}/favorites`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId })
            });

            if (button) {
                button.innerHTML = '<i class="fas fa-heart"></i>';
                button.classList.add('active');
            }

            // Обновляю локальный кэш
            favoriteProducts.add(productId);
        }

    } catch (error) {
        console.error('Ошибка изменения избранного:', error);
        alert('❌ Ошибка изменения избранного');
    }
}

// Проверяю, находится ли товар в избранном (из локального кэша)
function isFavorite(productId) {
    return favoriteProducts.has(productId);
}

// Запрашиваю статус избранного с сервера
async function checkFavoriteStatus(productId) {
    if (!currentUser) return false;

    try {
        const response = await fetch(`${API_BASE}/favorites/${productId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (data.success && data.isFavorite) {
            favoriteProducts.add(productId);
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

// ==================== КОРЗИНА ====================

// Добавляю товар в корзину
async function addToCart(productId) {
    if (!currentUser) {
        showAuthModal();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/cart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ productId, quantity: 1 })
        });

        const data = await response.json();

        if (data.success) {
            updateCartCount();
            alert('✅ Товар добавлен в корзину!');
        } else {
            alert('❌ Ошибка добавления в корзину');
        }
    } catch (error) {
        alert('❌ Ошибка сети');
    }
}

// Обновляю счетчик товаров в корзине
async function updateCartCount() {
    if (!currentUser) {
        const countElements = document.querySelectorAll('.cart-count, #cartCount');
        countElements.forEach(el => {
            if (el) el.textContent = '0';
        });
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/cart`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success && data.cart) {
            const total = data.cart.reduce((sum, item) => sum + item.quantity, 0);
            const countElements = document.querySelectorAll('.cart-count, #cartCount');
            countElements.forEach(el => {
                if (el) el.textContent = total;
            });
        }
    } catch (error) {
        console.error('Ошибка счетчика корзины:', error);
    }
}

// Загружаю корзину пользователя
async function loadCart() {
    const cartItems = document.getElementById('cartItems');
    const emptyCart = document.getElementById('emptyCart');
    const cartContent = document.getElementById('cartContent');
    const totalAmount = document.getElementById('totalAmount');

    if (!cartItems || !emptyCart || !cartContent) return;

    // Проверяю авторизацию
    const isAuth = await checkAuth();

    if (!isAuth) {
        cartContent.style.display = 'none';
        emptyCart.style.display = 'block';
        emptyCart.innerHTML = `
            <div class="empty-cart-message">
                <h2><i class="fas fa-lock"></i> Требуется авторизация</h2>
                <p>Войдите в аккаунт для просмотра корзины</p>
                <button class="btn-primary" onclick="showAuthModal()">Войти</button>
            </div>
        `;
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/cart`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success && data.cart && data.cart.length > 0) {
            cartContent.style.display = 'block';
            emptyCart.style.display = 'none';

            cartItems.innerHTML = data.cart.map(item => `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <img src="${item.image || 'https://via.placeholder.com/80x80'}" alt="${item.name}">
                        <div>
                            <h3>${item.name}</h3>
                            <p>${item.price} ₽ за шт.</p>
                        </div>
                    </div>
                    <div class="cart-item-actions">
                        <div class="quantity-control">
                            <button onclick="updateCartItem(${item.product_id}, -1)">-</button>
                            <span>${item.quantity}</span>
                            <button onclick="updateCartItem(${item.product_id}, 1)">+</button>
                        </div>
                        <p class="item-total">${item.price * item.quantity} ₽</p>
                        <button class="btn-secondary" onclick="removeFromCart(${item.product_id})">Удалить</button>
                    </div>
                </div>
            `).join('');

            // Считаю общую сумму
            const total = data.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            if (totalAmount) {
                totalAmount.textContent = total.toFixed(2);
            }
        } else {
            cartContent.style.display = 'none';
            emptyCart.style.display = 'block';
            emptyCart.innerHTML = `
                <div class="empty-cart-message">
                    <h2><i class="fas fa-shopping-cart"></i> Корзина пуста</h2>
                    <p>Добавьте товары из каталога</p>
                    <button class="btn-primary" onclick="window.location.href='catalog.html'">Перейти в каталог</button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
    }
}

// Обновляю количество товара в корзине
async function updateCartItem(productId, change) {
    try {
        const response = await fetch(`${API_BASE}/cart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                productId,
                quantity: change
            })
        });

        const data = await response.json();

        if (data.success) {
            loadCart();
            updateCartCount();
        } else {
            alert('❌ Ошибка обновления количества');
        }
    } catch (error) {
        console.error('Ошибка обновления корзины:', error);
    }
}

// Удаляю товар из корзины
async function removeFromCart(productId) {
    if (!confirm('Удалить товар из корзины?')) return;

    try {
        const response = await fetch(`${API_BASE}/cart/${productId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            loadCart();
            updateCartCount();
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
    }
}

// Очищаю всю корзину
async function clearCart() {
    if (!confirm('Очистить всю корзину?')) return;

    try {
        const response = await fetch(`${API_BASE}/cart`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            loadCart();
            updateCartCount();
        }
    } catch (error) {
        console.error('Ошибка очистки корзины:', error);
    }
}

// ==================== ОФОРМЛЕНИЕ ЗАКАЗА ====================

// Оформляю заказ
async function checkout() {
    if (!currentUser) {
        showAuthModal();
        return;
    }

    const totalElement = document.getElementById('totalAmount');
    const total = parseFloat(totalElement.textContent);

    if (total <= 0) {
        alert('Корзина пуста');
        return;
    }

    if (!confirm(`Оформить заказ на сумму ${total} ₽?`)) return;

    try {
        const response = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ total })
        });

        const data = await response.json();

        if (data.success) {
            alert(`✅ Заказ #${data.orderId} успешно оформлен!`);
            loadCart();
            updateCartCount();
        } else {
            alert('❌ Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        alert('❌ Ошибка сети');
    }
}

// ==================== ПРОСМОТР ТОВАРА ====================

// Перехожу на страницу товара
function viewProduct(productId) {
    window.location.href = `product.html?id=${productId}`;
}

// Загружаю детальную информацию о товаре
async function loadProductDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (!productId) {
        window.location.href = 'catalog.html';
        return;
    }

    try {
        // Загружаю данные товара
        const response = await fetch(`${API_BASE}/products/${productId}`);
        const data = await response.json();

        if (data.success && data.product) {
            displayProductDetail(data.product);

            // Фиксирую просмотр если пользователь авторизован
            if (currentUser) {
                await fetch(`${API_BASE}/products/${productId}/view`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                // Проверяю статус избранного
                const isFav = await checkFavoriteStatus(productId);
                const favoriteBtn = document.getElementById('favoriteBtn');
                if (favoriteBtn) {
                    favoriteBtn.innerHTML = isFav ? '<i class="fas fa-heart"></i> Убрать из избранного' : '<i class="far fa-heart"></i> Добавить в избранное';
                    favoriteBtn.classList.toggle('active', isFav);
                }
            }
        } else {
            window.location.href = 'catalog.html';
        }
    } catch (error) {
        console.error('Ошибка загрузки товара:', error);
        window.location.href = 'catalog.html';
    }
}

// Отображаю детальную информацию о товаре
function displayProductDetail(product) {
    const container = document.getElementById('productDetail');
    if (!container) return;

    const tags = product.tags || [];

    container.innerHTML = `
        <div class="product-detail-container">
            <div class="product-images">
                <img src="${product.image || 'https://via.placeholder.com/400x400'}" alt="${product.name}">
            </div>
            <div class="product-detail-info">
                <h1>${product.name}</h1>
                <div class="product-detail-price">${product.price} ₽</div>
                <div class="product-detail-category">${getCategoryName(product.category)}</div>
                
                <p class="product-description">${product.description}</p>
                
                ${tags.length > 0 ? `
                    <div class="product-tags" style="margin: 1rem 0;">
                        <strong>Теги:</strong> 
                        ${tags.map(tag => `<span>${tag}</span>`).join('')}
                    </div>
                ` : ''}
                
                <div class="quantity-selector">
                    <label><strong>Количество:</strong></label>
                    <input type="number" id="productQuantity" value="1" min="1" max="10">
                </div>
                
                <div class="product-detail-actions">
                    <button class="btn-primary" onclick="addToCartFromDetail(${product.id})">
                        Добавить в корзину
                    </button>
                    <button class="btn-secondary" id="favoriteBtn" onclick="toggleFavoriteFromDetail(${product.id})">
                        <i class="far fa-heart"></i> Добавить в избранное
                    </button>
                </div>
                
                <div style="margin-top: 2rem;">
                    <button class="btn-secondary" onclick="window.location.href='catalog.html'">
                        <i class="fas fa-arrow-left"></i> Вернуться в каталог
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Добавляю в корзину с указанием количества
function addToCartFromDetail(productId) {
    const quantity = parseInt(document.getElementById('productQuantity').value) || 1;

    if (!currentUser) {
        showAuthModal();
        return;
    }

    try {
        fetch(`${API_BASE}/cart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ productId, quantity })
        }).then(response => response.json())
            .then(data => {
                if (data.success) {
                    updateCartCount();
                    alert(`✅ Товар добавлен в корзину (${quantity} шт.)!`);
                } else {
                    alert('❌ Ошибка добавления в корзину');
                }
            });
    } catch (error) {
        alert('❌ Ошибка сети');
    }
}

// Переключаю избранное на странице товара
function toggleFavoriteFromDetail(productId) {
    const button = document.getElementById('favoriteBtn');
    toggleFavorite(productId, button);
}

// ==================== КОНТАКТЫ ====================

// Отправляю форму обратной связи
async function sendContactForm(event) {
    event.preventDefault();

    const name = document.getElementById('contactName')?.value;
    const email = document.getElementById('contactEmail')?.value;
    const message = document.getElementById('contactMessage')?.value;
    const responseDiv = document.getElementById('contactResponse');

    // Простая валидация
    if (!name || !email || !message) {
        showResponse('Пожалуйста, заполните все поля', 'error');
        return;
    }

    // Имитация отправки
    showResponse('Сообщение отправлено! Мы ответим вам в ближайшее время.', 'success');

    // Очистка формы
    const form = document.getElementById('contactForm');
    if (form) form.reset();

    function showResponse(text, type) {
        if (responseDiv) {
            responseDiv.textContent = text;
            responseDiv.className = type === 'success' ? 'success-message' : 'error-message';
            responseDiv.style.display = 'block';

            setTimeout(() => {
                responseDiv.style.display = 'none';
            }, 5000);
        } else {
            alert(text);
        }
    }
}

// ==================== ВЫХОД ====================

// Выход из аккаунта
function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        currentUser = null;
        token = null;
        localStorage.removeItem('token');
        updateAuthUI();
        updateCartCount();

        // Очищаю избранное из кэша
        favoriteProducts.clear();

        if (window.location.pathname.includes('cart.html')) {
            loadCart();
        }

        if (window.location.pathname.includes('favorites.html')) {
            loadFavorites();
        }

        if (window.location.pathname.includes('index.html')) {
            loadRecommendations();
        }
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

// Инициализирую страницу в зависимости от текущего URL
async function initializePage() {
    console.log('Инициализация страницы...');

    // Проверяю авторизацию
    await checkAuth();

    // Загружаю контент в зависимости от страницы
    const path = window.location.pathname;

    if (path.includes('index.html') || path === '/') {
        // Добавляю табы рекомендаций если их нет
        const recommendationsSection = document.querySelector('.recommendations');
        if (recommendationsSection && !document.querySelector('.recommendations-tabs')) {
            recommendationsSection.innerHTML = `
                <div class="container">
                    <div class="recommendation-header">
                        <h2>Рекомендации для вас</h2>
                        <button class="refresh-btn" onclick="loadRecommendationsByType(currentRecommendationType)">
                            <i class="fas fa-redo"></i> Обновить
                        </button>
                    </div>
                    <div class="recommendations-tabs">
                        <button onclick="loadRecommendationsByType('popular')" class="active">
                            <i class="fas fa-fire"></i> Популярное
                        </button>
                        ${currentUser ? `
                            <button onclick="loadRecommendationsByType('personal')">
                                <i class="fas fa-bullseye"></i> Для вас
                            </button>
                        ` : ''}
                        <button onclick="loadRecommendationsByType('favorites')">
                            <i class="fas fa-heart"></i> В избранном
                        </button>
                    </div>
                    <div class="products-grid" id="recommendationsGrid">
                        <p>Загрузка товаров...</p>
                    </div>
                </div>
            `;

            // Загружаю популярные товары по умолчанию
            await loadRecommendationsByType('popular');
        }
    }

    if (path.includes('catalog.html')) {
        await loadCatalog();

        // Добавляю фильтры если их нет
        if (!document.querySelector('.filters')) {
            const catalogSection = document.querySelector('.catalog');
            if (catalogSection) {
                catalogSection.innerHTML = `
                    <div class="container">
                        <h1>Каталог товаров</h1>
                        <div class="filters">
                            <select id="categoryFilter" onchange="filterProducts()">
                                <option value="">Все категории</option>
                                <option value="face">Уход за лицом</option>
                                <option value="lips">Помады и блески</option>
                                <option value="eyes">Для глаз</option>
                            </select>
                            
                            <select id="sortFilter" onchange="filterProducts()">
                                <option value="">Сортировка</option>
                                <option value="price_asc">Цена: по возрастанию</option>
                                <option value="price_desc">Цена: по убыванию</option>
                                <option value="name">По названию</option>
                            </select>
                        </div>
                        <div class="products-grid" id="catalogGrid">
                            <p>Загрузка товаров...</p>
                        </div>
                    </div>
                `;

                await loadCatalog();
            }
        }
    }

    if (path.includes('cart.html')) {
        await loadCart();
    }

    if (path.includes('product.html')) {
        await loadProductDetail();
    }

    if (path.includes('favorites.html')) {
        await loadFavorites();
    }

    // Загружаю избранное для кэширования (чтобы быстро показывать сердечки)
    if (currentUser) {
        try {
            const response = await fetch(`${API_BASE}/favorites`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            if (data.success && data.favorites) {
                data.favorites.forEach(product => {
                    favoriteProducts.add(product.id);
                });
            }
        } catch (error) {
            console.error('Ошибка загрузки избранного для кэша:', error);
        }
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', initializePage);

// Закрытие модального окна при клике вне его
document.addEventListener('click', function (event) {
    const modal = document.getElementById('authModal');
    if (event.target === modal) {
        closeAuthModal();
    }
});

// Закрытие модального окна при нажатии ESC
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        closeAuthModal();
    }
});