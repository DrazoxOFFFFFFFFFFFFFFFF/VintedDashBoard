const App = {
    state: { items: [], transactions: [], settings: { goal: 2000, currency: '€' } },
    charts: { sales: null, status: null, profit: null },
    currentPage: 'dashboard',

    init() {
        this.loadData();
        this.setupNavigation();
        this.navigate('dashboard');
    },

    loadData() {
        try {
            const saved = localStorage.getItem('vinted_dashboard_data');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.state.items = parsed.items || [];
                this.state.transactions = parsed.transactions || [];
                this.state.settings = { ...this.state.settings, ...(parsed.settings || {}) };
            }
        } catch (e) {
            this.state.items = [];
            this.state.transactions = [];
        }
    },

    saveData() {
        try {
            localStorage.setItem('vinted_dashboard_data', JSON.stringify(this.state));
        } catch (e) { }
    },

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const page = el.dataset.page;
                this.navigate(page);
            });
        });
    },

    navigate(page) {
        this.currentPage = page;
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.page === page);
        });
        this.renderPage();
    },

    renderPage() {
        const container = document.getElementById('page-content');
        this.destroyCharts();
        switch (this.currentPage) {
            case 'dashboard':
                this.renderDashboard(container);
                break;
            case 'stock':
                this.renderStock(container);
                break;
            case 'accounting':
                this.renderAccounting(container);
                break;
            case 'goals':
                this.renderGoals(container);
                break;
        }
        this.updateSidebarProgress();
        this.updateNavBadges();
    },

    updateNavBadges() {
        const badge = document.querySelector('.nav-item[data-page="stock"] .nav-badge');
        if (badge) badge.textContent = this.state.items.length;
    },

    /* ========== RENDER HELPERS ========== */

    h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
                if (k === 'className') el.className = v;
                else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
                else if (k === 'innerHTML') el.innerHTML = v;
                else el.setAttribute(k, v);
            }
        }
        for (const c of children) {
            if (typeof c === 'string') el.appendChild(document.createTextNode(c));
            else if (c) el.appendChild(c);
        }
        return el;
    },

    /* ========== DASHBOARD ========== */

    renderDashboard(container) {
        container.innerHTML = '';
        const items = this.state.items;
        const transactions = this.state.transactions;
        const totalRevenue = this.getTotalRevenue();
        const totalExpenses = this.getTotalExpenses();
        const profit = totalRevenue - totalExpenses;
        const soldCount = this.getSoldCount();
        const inStock = items.filter(i => i.status === 'en_vente').length;
        const goalPct = this.state.settings.goal > 0 ? Math.min(100, Math.round((totalRevenue / this.state.settings.goal) * 100)) : 0;

        container.appendChild(this.h('div', { className: 'page-header' },
            this.h('h1', {},
                this.h('i', { className: 'fas fa-th-large' }),
                ' Tableau de bord'
            ),
            this.h('div', { className: 'header-meta' },
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` ${items.length} articles`),
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` ${transactions.length} transactions`),
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` ${soldCount} vendus`)
            )
        ));

        const kpiGrid = this.h('div', { className: 'kpi-grid' });
        const kpis = [
            { icon: 'fa-coins', label: 'Revenu Total', value: this.fmt(totalRevenue), color: 'success', sub: `${soldCount} articles vendus`, bgIcon: 'fa-chart-line', trend: `${goalPct}%` },
            { icon: 'fa-chart-simple', label: 'Bénéfice Net', value: this.fmt(profit), color: profit >= 0 ? 'success' : 'danger', sub: `${this.fmt(totalExpenses)} de frais`, bgIcon: 'fa-chart-line', trend: profit >= 0 ? '+' + this.fmt(profit) : this.fmt(profit) },
            { icon: 'fa-tag', label: 'Articles Vendus', value: soldCount, color: 'info', sub: `${items.length} articles au total`, bgIcon: 'fa-cube', trend: items.length ? Math.round((soldCount / items.length) * 100) + '%' : '0%' },
            { icon: 'fa-cubes', label: 'En Stock', value: inStock, color: 'accent', sub: `Objectif ${this.fmt(this.state.settings.goal)}`, bgIcon: 'fa-boxes', trend: inStock + ' dispo' }
        ];

        kpis.forEach((k, i) => {
            const card = this.h('div', { className: `kpi-card ${k.color} animate-in d${i + 1}` });
            card.innerHTML = `<i class="fas ${k.bgIcon} card-bg-icon"></i>`;
            card.appendChild(this.h('div', { className: 'kpi-header' },
                this.h('div', { className: `kpi-icon ${k.color}` }, this.h('i', { className: `fas ${k.icon}` })),
                this.h('div', { className: `kpi-trend ${k.color === 'danger' ? 'down' : 'up'}` },
                    this.h('i', { className: `fas fa-${k.color === 'danger' ? 'caret-down' : 'caret-up'}` }),
                    k.trend
                )
            ));
            card.appendChild(this.h('span', { className: 'kpi-label' }, k.label));
            card.appendChild(this.h('div', { className: 'kpi-value' }, String(k.value)));
            if (k.sub) card.appendChild(this.h('div', { className: 'kpi-sub' },
                this.h('i', { className: `fas fa-${k.color === 'danger' ? 'minus-circle' : 'info-circle'}` }),
                k.sub
            ));

            if (k.icon === 'fa-sack-dollar' && this.state.settings.goal > 0) {
                card.appendChild(this.h('div', { className: 'kpi-progress' },
                    this.h('div', { className: `kpi-progress-bar ${k.color}`, style: `width:${goalPct}%` })
                ));
            }
            kpiGrid.appendChild(card);
        });
        container.appendChild(kpiGrid);

        const chartsGrid = this.h('div', { className: 'charts-grid' });

        const salesCard = this.h('div', { className: 'chart-card animate-in d5' });
        salesCard.innerHTML = `<div class="chart-header">
            <h3><i class="fas fa-chart-line"></i> Évolution des ventes</h3>
            <span class="chart-period"><i class="fas fa-calendar"></i> 30 jours</span>
        </div>
        <div class="chart-container"><canvas id="salesChart"></canvas></div>`;
        chartsGrid.appendChild(salesCard);

        const statusCard = this.h('div', { className: 'chart-card animate-in d6' });
        statusCard.innerHTML = `<div class="chart-header">
            <h3><i class="fas fa-chart-pie"></i> Statuts des articles</h3>
            <span class="chart-period"><i class="fas fa-circle" style="color:var(--accent);font-size:0.5rem"></i> en direct</span>
        </div>
        <div class="chart-container"><canvas id="statusChart"></canvas></div>`;
        chartsGrid.appendChild(statusCard);

        container.appendChild(chartsGrid);

        this.renderRecentActivity(container);
        this.initDashboardCharts();
    },

    renderRecentActivity(container) {
        const all = [...this.state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
        const wrap = this.h('div', { className: 'table-container animate-in d6' });

        if (!all.length) {
            wrap.innerHTML = `<div class="table-header">
                <h3><i class="fas fa-clock"></i> Dernières activités</h3>
            </div>
            <div class="empty-state">
                <i class="fas fa-store empty-icon accent"></i>
                <p>Bienvenue sur votre tableau de bord</p>
                <p class="sub"><i class="fas fa-arrow-right"></i> Ajoutez vos premiers articles dans l'onglet Stock</p>
            </div>`;
            container.appendChild(wrap);
            return;
        }

        wrap.innerHTML = `<div class="table-header">
            <h3><i class="fas fa-clock"></i> Dernières activités</h3>
            <span style="font-size:0.75rem;color:var(--text-muted)"><i class="fas fa-sync"></i> en temps réel</span>
        </div>`;
        const table = document.createElement('table');
        table.innerHTML = `<thead><tr>
            <th><i class="fas fa-calendar"></i> Date</th>
            <th><i class="fas fa-tag"></i> Description</th>
            <th><i class="fas fa-exchange-alt"></i> Type</th>
            <th><i class="fas fa-euro-sign"></i> Montant</th>
        </tr></thead><tbody id="recentTbody"></tbody>`;
        const tbody = table.querySelector('#recentTbody') || table.appendChild(document.createElement('tbody'));

        all.forEach(t => {
            const isRevenue = t.type === 'revenu';
            const tr = this.h('tr', {});
            const icon = isRevenue ? 'fa-arrow-up' : 'fa-arrow-down';
            const badgeIcon = isRevenue ? 'fa-check' : 'fa-times';
            tr.innerHTML = `
                <td style="font-size:0.8rem;color:var(--text-muted)"><i class="far fa-calendar-alt"></i> ${this.fmtDate(t.date)}</td>
                <td style="color:var(--text-primary)"><i class="fas ${icon}" style="font-size:0.65rem;color:${isRevenue ? 'var(--success)' : 'var(--danger)'};margin-right:8px"></i>${this.esc(t.description)}</td>
                <td><span class="status-badge ${isRevenue ? 'vendu' : 'retourne'}"><i class="fas ${badgeIcon}"></i> ${isRevenue ? 'Revenu' : 'Dépense'}</span></td>
                <td style="color:${isRevenue ? 'var(--success)' : 'var(--danger)'};font-weight:700;font-size:0.95rem">${isRevenue ? '+' : '-'}${this.fmt(t.amount)}</td>
            `;
            tbody.appendChild(tr);
        });
        wrap.appendChild(table);
        container.appendChild(wrap);
    },

    /* ========== STOCK ========== */

    renderStock(container) {
        container.innerHTML = '';
        container.appendChild(this.h('div', { className: 'page-header' },
            this.h('h1', {},
                this.h('i', { className: 'fas fa-box' }),
                ' Gestion du Stock'
            ),
            this.h('div', { className: 'header-meta' },
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` ${this.state.items.length} articles`),
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` ${this.getSoldCount()} vendus`)
            )
        ));

        const formCard = this.h('div', { className: 'form-card animate-in d1' });
        formCard.innerHTML = `<div class="form-title"><i class="fas fa-plus-circle"></i> Ajouter un article</div>`;

        const form = this.h('form', { id: 'stockForm' });
        form.innerHTML = `<div class="form-row">
            <div class="form-group">
                <label><i class="fas fa-tag"></i> Nom de l'article</label>
                <input type="text" id="itemName" placeholder="Ex: Nike Air Max 90" required>
            </div>
            <div class="form-group">
                <label><i class="fas fa-arrow-down"></i> Prix d'achat</label>
                <input type="number" id="itemPurchasePrice" placeholder="0.00" step="0.01" min="0" required>
            </div>
            <div class="form-group">
                <label><i class="fas fa-arrow-up"></i> Prix de vente</label>
                <input type="number" id="itemSellingPrice" placeholder="0.00" step="0.01" min="0" required>
            </div>
            <div class="form-group">
                <label><i class="fas fa-flag"></i> Statut</label>
                <select id="itemStatus">
                    <option value="en_vente"><i class="fas fa-clock"></i> En vente</option>
                    <option value="vendu"><i class="fas fa-check"></i> Vendu</option>
                    <option value="expedie"><i class="fas fa-shipping-fast"></i> Expédié</option>
                    <option value="livre"><i class="fas fa-home"></i> Livré</option>
                    <option value="retourne"><i class="fas fa-undo"></i> Retourné</option>
                </select>
            </div>
        </div>
        <div class="form-actions">
            <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Ajouter l'article</button>
        </div>`;

        form.addEventListener('submit', (e) => this.handleAddItem(e));
        formCard.appendChild(form);
        container.appendChild(formCard);

        const tc = this.h('div', { className: 'table-container animate-in d2' });

        const searchIcon = this.h('i', { className: 'fas fa-search' });
        const search = this.h('input', { type: 'text', placeholder: 'Rechercher un article...', id: 'stockSearch' });
        const searchBox = this.h('div', { className: 'search-box' }, searchIcon, search);

        const statusFilter = this.h('select', { id: 'stockStatusFilter', className: 'filter-select' });
        statusFilter.innerHTML = '<option value="all"><i class="fas fa-list"></i> Tous les statuts</option><option value="en_vente">En vente</option><option value="vendu">Vendu</option><option value="expedie">Expédié</option><option value="livre">Livré</option><option value="retourne">Retourné</option>';

        tc.innerHTML = `<div class="table-header">
            <h3><i class="fas fa-list"></i> Tous les articles</h3>
            <div class="table-actions"></div>
        </div>`;
        tc.querySelector('.table-actions').appendChild(searchBox);
        tc.querySelector('.table-actions').appendChild(statusFilter);

        const tw = this.h('div', { id: 'stockTableWrap' });
        tc.appendChild(tw);
        container.appendChild(tc);

        const doFilter = () => this.renderStockTable();
        search.addEventListener('input', doFilter);
        statusFilter.addEventListener('change', doFilter);

        this.renderStockTable();
    },

    renderStockTable() {
        const wrap = document.getElementById('stockTableWrap');
        if (!wrap) return;
        const query = (document.getElementById('stockSearch')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('stockStatusFilter')?.value || 'all';

        let items = this.state.items;
        if (statusFilter !== 'all') items = items.filter(i => i.status === statusFilter);
        if (query) items = items.filter(i => i.name.toLowerCase().includes(query));

        if (!items.length) {
            wrap.innerHTML = `<div class="empty-state">
                <i class="fas fa-box-open empty-icon"></i>
                <p>Aucun article trouvé</p>
                <p class="sub"><i class="fas fa-plus"></i> Ajoutez un article ou modifiez vos filtres</p>
            </div>`;
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `<thead><tr>
            <th><i class="fas fa-cube"></i> Article</th>
            <th><i class="fas fa-arrow-down"></i> Achat</th>
            <th><i class="fas fa-arrow-up"></i> Vente</th>
            <th><i class="fas fa-percent"></i> Marge</th>
            <th><i class="fas fa-flag"></i> Statut</th>
            <th><i class="far fa-calendar"></i> Date</th>
            <th><i class="fas fa-tools"></i> Actions</th>
        </tr></thead><tbody id="stockTableBody"></tbody>`;
        const tbody = table.querySelector('#stockTableBody');

        const statusIcons = { en_vente: 'fa-clock', vendu: 'fa-check-circle', expedie: 'fa-shipping-fast', livre: 'fa-home', retourne: 'fa-undo' };

        items.forEach(item => {
            const margin = item.sellingPrice - item.purchasePrice;
            const marginPct = item.purchasePrice > 0 ? ((margin / item.purchasePrice) * 100).toFixed(0) : '-';
            const tr = this.h('tr', {});
            tr.innerHTML = `
                <td style="font-weight:600;color:var(--text-primary)"><i class="fas fa-cube" style="font-size:0.7rem;color:var(--accent);margin-right:8px;opacity:0.5"></i>${this.esc(item.name)}</td>
                <td style="color:var(--danger)">${this.fmt(item.purchasePrice)}</td>
                <td style="color:var(--success)">${this.fmt(item.sellingPrice)}</td>
                <td style="color:${margin >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700">${margin >= 0 ? '+' : ''}${this.fmt(margin)} <span style="font-weight:400;opacity:0.6">(${marginPct}%)</span></td>
                <td><span class="status-badge ${item.status}"><i class="fas ${statusIcons[item.status] || 'fa-circle'}"></i> ${this.statusLabel(item.status)}</span></td>
                <td style="font-size:0.8rem;color:var(--text-muted)"><i class="far fa-calendar-alt"></i> ${this.fmtDate(item.dateAdded)}</td>
                <td>
                    <button class="btn btn-ghost btn-xs btn-icon edit-item" data-id="${item.id}" title="Modifier"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-ghost btn-xs btn-icon delete-item" data-id="${item.id}" title="Supprimer" style="color:var(--danger)"><i class="fas fa-trash-can"></i></button>
                </td>
            `;
            tr.querySelector('.edit-item').addEventListener('click', () => this.handleEditItem(item.id));
            tr.querySelector('.delete-item').addEventListener('click', () => this.handleDeleteItem(item.id));
            tbody.appendChild(tr);
        });
        wrap.innerHTML = '';
        wrap.appendChild(table);
    },

    handleAddItem(e) {
        e.preventDefault();
        const name = document.getElementById('itemName').value.trim();
        const purchasePrice = parseFloat(document.getElementById('itemPurchasePrice').value) || 0;
        const sellingPrice = parseFloat(document.getElementById('itemSellingPrice').value) || 0;
        const status = document.getElementById('itemStatus').value;

        if (!name) { this.toast('Veuillez entrer un nom d\'article', 'error'); return; }

        const item = {
            id: this.id(),
            name,
            purchasePrice,
            sellingPrice,
            status,
            dateAdded: new Date().toISOString().split('T')[0],
            dateSold: status === 'vendu' ? new Date().toISOString().split('T')[0] : null
        };

        this.state.items.unshift(item);
        this.saveData();

        if (status === 'vendu') {
            this.state.transactions.push({
                id: this.id(), type: 'revenu', amount: sellingPrice,
                description: `Vente: ${name}`, category: 'vente',
                date: item.dateAdded, itemId: item.id
            });
            this.state.transactions.push({
                id: this.id(), type: 'depense', amount: purchasePrice,
                description: `Achat: ${name}`, category: 'achat',
                date: item.dateAdded, itemId: item.id
            });
            this.saveData();
        }

        document.getElementById('stockForm').reset();
        this.renderStockTable();
        this.updateNavBadges();
        this.toast(`"${name}" ajouté avec succès`, 'success');
    },

    handleDeleteItem(id) {
        if (!confirm('Supprimer cet article définitivement ?')) return;
        this.state.items = this.state.items.filter(i => i.id !== id);
        this.state.transactions = this.state.transactions.filter(t => t.itemId !== id);
        this.saveData();
        this.renderStockTable();
        this.updateNavBadges();
        this.toast('Article supprimé', 'info');
    },

    handleEditItem(id) {
        const item = this.state.items.find(i => i.id === id);
        if (!item) return;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <h2><i class="fas fa-pen-to-square"></i> Modifier l'article</h2>
                <form id="editForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label><i class="fas fa-tag"></i> Nom</label>
                            <input type="text" id="editName" value="${this.esc(item.name)}" required>
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-arrow-down"></i> Prix d'achat</label>
                            <input type="number" id="editPurchase" value="${item.purchasePrice}" step="0.01" min="0" required>
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-arrow-up"></i> Prix de vente</label>
                            <input type="number" id="editSelling" value="${item.sellingPrice}" step="0.01" min="0" required>
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-flag"></i> Statut</label>
                            <select id="editStatus">
                                <option value="en_vente" ${item.status === 'en_vente' ? 'selected' : ''}>En vente</option>
                                <option value="vendu" ${item.status === 'vendu' ? 'selected' : ''}>Vendu</option>
                                <option value="expedie" ${item.status === 'expedie' ? 'selected' : ''}>Expédié</option>
                                <option value="livre" ${item.status === 'livre' ? 'selected' : ''}>Livré</option>
                                <option value="retourne" ${item.status === 'retourne' ? 'selected' : ''}>Retourné</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-ghost" id="cancelEdit"><i class="fas fa-times"></i> Annuler</button>
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.querySelector('#cancelEdit').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#editForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const oldStatus = item.status;
            item.name = document.getElementById('editName').value.trim();
            item.purchasePrice = parseFloat(document.getElementById('editPurchase').value) || 0;
            item.sellingPrice = parseFloat(document.getElementById('editSelling').value) || 0;
            item.status = document.getElementById('editStatus').value;

            if (item.status === 'vendu' && !item.dateSold) {
                item.dateSold = new Date().toISOString().split('T')[0];
            }
            if (item.status !== 'vendu') {
                item.dateSold = null;
            }

            this.syncTransactions(item, oldStatus);
            this.saveData();
            this.renderStockTable();
            overlay.remove();
            this.toast('Article modifié', 'success');
        });
    },

    syncTransactions(item, oldStatus) {
        this.state.transactions = this.state.transactions.filter(t => t.itemId !== item.id);
        if (item.status === 'vendu') {
            this.state.transactions.push({
                id: this.id(), type: 'revenu', amount: item.sellingPrice,
                description: `Vente: ${item.name}`, category: 'vente',
                date: item.dateSold || new Date().toISOString().split('T')[0], itemId: item.id
            });
            this.state.transactions.push({
                id: this.id(), type: 'depense', amount: item.purchasePrice,
                description: `Achat: ${item.name}`, category: 'achat',
                date: item.dateAdded, itemId: item.id
            });
        }
    },

    /* ========== ACCOUNTING ========== */

    renderAccounting(container) {
        container.innerHTML = '';
        const revenue = this.getTotalRevenue();
        const expenses = this.getTotalExpenses();
        const profit = revenue - expenses;
        const profitPct = revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 100) : 0;

        container.appendChild(this.h('div', { className: 'page-header' },
            this.h('h1', {},
                this.h('i', { className: 'fas fa-euro-sign' }),
                ' Comptabilité'
            ),
            this.h('div', { className: 'header-meta' },
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` Marge: ${profitPct}%`),
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` ${this.state.transactions.length} opérations`)
            )
        ));

        const kpiGrid = this.h('div', { className: 'kpi-grid' });
        [
            { icon: 'fa-circle-arrow-up', label: 'Revenus', value: this.fmt(revenue), color: 'success', bgIcon: 'fa-chart-bar', trend: '+100%' },
            { icon: 'fa-circle-arrow-down', label: 'Dépenses', value: this.fmt(expenses), color: 'danger', bgIcon: 'fa-chart-bar', trend: '-100%' },
            { icon: 'fa-calculator', label: 'Bénéfice Net', value: this.fmt(profit), color: profit >= 0 ? 'success' : 'danger', bgIcon: 'fa-coins', trend: profitPct + '%' }
        ].forEach((k, i) => {
            const card = this.h('div', { className: `kpi-card ${k.color} animate-in d${i + 1}` });
            card.innerHTML = `<i class="fas ${k.bgIcon} card-bg-icon"></i>`;
            card.appendChild(this.h('div', { className: 'kpi-header' },
                this.h('div', { className: `kpi-icon ${k.color}` }, this.h('i', { className: `fas ${k.icon}` })),
                this.h('div', { className: `kpi-trend ${k.color === 'danger' ? 'down' : 'up'}` },
                    this.h('i', { className: `fas fa-${k.color === 'danger' ? 'caret-down' : 'caret-up'}` }),
                    k.trend
                )
            ));
            card.appendChild(this.h('span', { className: 'kpi-label' }, k.label));
            card.appendChild(this.h('div', { className: 'kpi-value' }, String(k.value)));
            kpiGrid.appendChild(card);
        });
        container.appendChild(kpiGrid);

        const formCard = this.h('div', { className: 'form-card animate-in d4' });
        formCard.innerHTML = `<div class="form-title"><i class="fas fa-plus-circle"></i> Nouvelle transaction</div>`;
        const form = this.h('form', { id: 'transactionForm' });
        form.innerHTML = `<div class="form-row">
            <div class="form-group">
                <label><i class="fas fa-exchange-alt"></i> Type</label>
                <select id="transType">
                    <option value="revenu"><i class="fas fa-arrow-up"></i> Revenu</option>
                    <option value="depense"><i class="fas fa-arrow-down"></i> Dépense</option>
                </select>
            </div>
            <div class="form-group">
                <label><i class="fas fa-euro-sign"></i> Montant</label>
                <input type="number" id="transAmount" placeholder="0.00" step="0.01" min="0" required>
            </div>
            <div class="form-group">
                <label><i class="fas fa-folder"></i> Catégorie</label>
                <select id="transCategory">
                    <option value="vente">Vente</option>
                    <option value="achat">Achat</option>
                    <option value="frais_port">Frais de port</option>
                    <option value="commission">Commission Vinted</option>
                    <option value="autre">Autre</option>
                </select>
            </div>
            <div class="form-group">
                <label><i class="fas fa-pen"></i> Description</label>
                <input type="text" id="transDescription" placeholder="Ex: Vente Nike Air Max" required>
            </div>
        </div>
        <div class="form-actions">
            <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Ajouter</button>
        </div>`;
        form.addEventListener('submit', (e) => this.handleAddTransaction(e));
        formCard.appendChild(form);
        container.appendChild(formCard);

        const tc = this.h('div', { className: 'table-container animate-in d5' });
        tc.innerHTML = `<div class="table-header">
            <h3><i class="fas fa-receipt"></i> Historique des transactions</h3>
            <span style="font-size:0.75rem;color:var(--text-muted)"><i class="fas fa-sort-down"></i> du plus récent</span>
        </div>
        <div id="transactionTableWrap"></div>`;
        container.appendChild(tc);

        this.renderTransactionTable();
    },

    renderTransactionTable() {
        const wrap = document.getElementById('transactionTableWrap');
        if (!wrap) return;
        const all = [...this.state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

        if (!all.length) {
            wrap.innerHTML = `<div class="empty-state">
                <i class="fas fa-receipt empty-icon"></i>
                <p>Aucune transaction</p>
                <p class="sub"><i class="fas fa-sync"></i> Elles sont créées automatiquement lors des ventes</p>
            </div>`;
            return;
        }

        const catIcons = { vente: 'fa-store', achat: 'fa-cart-shopping', frais_port: 'fa-truck', commission: 'fa-percent', autre: 'fa-circle' };
        const table = document.createElement('table');
        table.innerHTML = `<thead><tr>
            <th><i class="far fa-calendar"></i> Date</th>
            <th><i class="fas fa-tag"></i> Description</th>
            <th><i class="fas fa-folder"></i> Catégorie</th>
            <th><i class="fas fa-exchange-alt"></i> Type</th>
            <th><i class="fas fa-euro-sign"></i> Montant</th>
            <th><i class="fas fa-tools"></i> Actions</th>
        </tr></thead><tbody id="transTableBody"></tbody>`;
        const tbody = table.querySelector('#transTableBody');

        all.forEach(t => {
            const isRevenue = t.type === 'revenu';
            const tr = this.h('tr', {});
            tr.innerHTML = `
                <td style="font-size:0.8rem;color:var(--text-muted)"><i class="far fa-calendar-alt"></i> ${this.fmtDate(t.date)}</td>
                <td style="color:var(--text-primary)">${this.esc(t.description)}</td>
                <td style="font-size:0.8rem"><i class="fas ${catIcons[t.category] || 'fa-circle'}" style="color:var(--text-muted);margin-right:4px"></i> ${this.catLabel(t.category)}</td>
                <td><span class="status-badge ${isRevenue ? 'vendu' : 'retourne'}"><i class="fas ${isRevenue ? 'fa-check' : 'fa-times'}"></i> ${isRevenue ? 'Revenu' : 'Dépense'}</span></td>
                <td style="color:${isRevenue ? 'var(--success)' : 'var(--danger)'};font-weight:700">${isRevenue ? '+' : '-'}${this.fmt(t.amount)}</td>
                <td><button class="btn btn-ghost btn-xs btn-icon delete-trans" data-id="${t.id}" style="color:var(--danger)"><i class="fas fa-trash-can"></i></button></td>
            `;
            tr.querySelector('.delete-trans').addEventListener('click', () => {
                this.state.transactions = this.state.transactions.filter(x => x.id !== t.id);
                this.saveData();
                this.renderTransactionTable();
                this.toast('Transaction supprimée', 'info');
            });
            tbody.appendChild(tr);
        });
        wrap.innerHTML = '';
        wrap.appendChild(table);
    },

    handleAddTransaction(e) {
        e.preventDefault();
        const type = document.getElementById('transType').value;
        const amount = parseFloat(document.getElementById('transAmount').value) || 0;
        const category = document.getElementById('transCategory').value;
        const description = document.getElementById('transDescription').value.trim();

        if (!amount || amount <= 0) { this.toast('Montant invalide', 'error'); return; }
        if (!description) { this.toast('Description requise', 'error'); return; }

        this.state.transactions.push({
            id: this.id(), type, amount, category, description,
            date: new Date().toISOString().split('T')[0], itemId: null
        });
        this.saveData();
        document.getElementById('transactionForm').reset();
        this.renderTransactionTable();
        this.toast('Transaction ajoutée', 'success');
    },

    /* ========== GOALS ========== */

    renderGoals(container) {
        container.innerHTML = '';
        const goal = this.state.settings.goal;
        const revenue = this.getTotalRevenue();
        const profit = this.getTotalRevenue() - this.getTotalExpenses();
        const pct = Math.min(100, Math.round((revenue / goal) * 100));
        const sold = this.getSoldCount();
        const items = this.state.items;

        container.appendChild(this.h('div', { className: 'page-header' },
            this.h('h1', {},
                this.h('i', { className: 'fas fa-bullseye' }),
                ' Objectifs'
            ),
            this.h('div', { className: 'header-meta' },
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` ${pct}% complété`),
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` Reste: ${this.fmt(goal - revenue)}`)
            )
        ));

        const hero = this.h('div', { className: 'goal-hero animate-in d1' });
        hero.innerHTML = `<div class="goal-hero-icon"><i class="fas fa-trophy"></i></div>
            <div class="goal-amount">${this.fmt(revenue)}</div>
            <div class="goal-label"><i class="fas fa-arrow-right"></i> sur <strong>${this.fmt(goal)}</strong> objectif de revenus</div>
            <div class="goal-progress-container">
                <div class="goal-progress-info">
                    <span><i class="fas fa-check-circle" style="color:var(--success)"></i> <strong>${this.fmt(revenue)}</strong></span>
                    <span><i class="fas fa-flag-checkered" style="color:var(--text-muted)"></i> <strong>${this.fmt(goal)}</strong></span>
                </div>
                <div class="goal-progress-bar">
                    <div class="goal-progress-fill" style="width:${pct}%"></div>
                </div>
                <div class="goal-progress-info" style="margin-top:8px">
                    <span style="color:var(--accent)">${pct}% atteint</span>
                    <span style="color:var(--text-muted)">${this.fmt(goal - revenue)} restants</span>
                </div>
            </div>`;
        container.appendChild(hero);

        const remainder = goal - revenue;
        const avgPrice = items.length && sold ? revenue / sold : 0;
        const itemsToGo = avgPrice > 0 ? Math.ceil(remainder / avgPrice) : '-';

        const stats = [
            { icon: 'fa-shirt', value: sold, label: 'Articles vendus' },
            { icon: 'fa-coins', value: profit >= 0 ? this.fmt(profit) : `-${this.fmt(Math.abs(profit))}`, label: 'Bénéfice total' },
            { icon: 'fa-calculator', value: sold ? this.fmt(revenue / sold) : '0 ' + this.state.settings.currency, label: 'Prix moyen vente' },
            { icon: 'fa-percentage', value: items.length ? `${Math.round((sold / items.length) * 100)}%` : '0%', label: 'Taux de vente' },
            { icon: 'fa-cubes', value: items.length, label: 'Total articles' },
            { icon: 'fa-forward', value: itemsToGo, label: 'Ventes nécessaires' },
            { icon: 'fa-receipt', value: this.state.transactions.length, label: 'Transactions' },
            { icon: 'fa-star', value: this.fmt(profit / Math.max(1, sold)), label: 'Marge moyenne/article' }
        ];

        const statsGrid = this.h('div', { className: 'goal-stats-grid' });
        stats.forEach((s, i) => {
            const card = this.h('div', { className: `goal-stat-card animate-in d${Math.min(i + 2, 6)}` });
            card.innerHTML = `<div class="goal-stat-icon"><i class="fas ${s.icon}"></i></div>
                <div class="goal-stat-value">${s.value}</div>
                <div class="goal-stat-label">${s.label}</div>`;
            statsGrid.appendChild(card);
        });
        container.appendChild(statsGrid);
    },

    /* ========== CHARTS ========== */

    initDashboardCharts() {
        setTimeout(() => {
            this.initSalesChart();
            this.initStatusChart();
        }, 100);
    },

    destroyCharts() {
        if (this.charts.sales) { this.charts.sales.destroy();
            this.charts.sales = null; }
        if (this.charts.status) { this.charts.status.destroy();
            this.charts.status = null; }
    },

    initSalesChart() {
        const canvas = document.getElementById('salesChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const days = 30;
        const labels = [];
        const sales = [];
        const expenses = [];
        const now = new Date();

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            labels.push(dateStr.slice(5));

            sales.push(this.state.transactions
                .filter(t => t.type === 'revenu' && t.date === dateStr)
                .reduce((s, t) => s + t.amount, 0));
            expenses.push(this.state.transactions
                .filter(t => t.type === 'depense' && t.date === dateStr)
                .reduce((s, t) => s + t.amount, 0));
        }

        const ctx = canvas.getContext('2d');
        this.charts.sales = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Revenus',
                    data: sales,
                    borderColor: '#00e676',
                    backgroundColor: 'rgba(0, 230, 118, 0.08)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#00e676',
                    pointBorderColor: '#00e676',
                    pointBorderWidth: 0,
                    pointHoverBackgroundColor: '#00e676',
                    pointHoverBorderWidth: 0,
                    borderWidth: 2.5
                }, {
                    label: 'Dépenses',
                    data: expenses,
                    borderColor: '#ff5252',
                    backgroundColor: 'rgba(255, 82, 82, 0.05)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#ff5252',
                    pointBorderColor: '#ff5252',
                    pointBorderWidth: 0,
                    borderWidth: 1.5,
                    borderDash: [5, 5]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: { color: '#8888b0', padding: 16, font: { size: 11, weight: '500' }, usePointStyle: true, pointStyle: 'circle' }
                    },
                    tooltip: {
                        backgroundColor: '#16162a',
                        titleColor: '#eeeeff',
                        bodyColor: '#8888b0',
                        borderColor: 'rgba(255,255,255,0.06)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + ' ' + this.state.settings.currency }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                        ticks: { color: '#505070', maxTicksLimit: 8, font: { size: 10 } }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                        ticks: { color: '#505070', font: { size: 10 }, callback: v => v + this.state.settings.currency },
                        beginAtZero: true
                    }
                }
            }
        });
    },

    initStatusChart() {
        const canvas = document.getElementById('statusChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const statuses = ['en_vente', 'vendu', 'expedie', 'livre', 'retourne'];
        const counts = statuses.map(s => this.state.items.filter(i => i.status === s).length);
        const colors = ['#00d4ff', '#00e676', '#ffd740', '#40c4ff', '#ff5252'];
        const labels = ['En vente', 'Vendu', 'Expédié', 'Livré', 'Retourné'];
        const icons = ['\uf017', '\uf00c', '\uf48b', '\uf015', '\uf0e2'];

        const ctx = canvas.getContext('2d');
        this.charts.status = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: counts,
                    backgroundColor: colors.map(c => c + 'CC'),
                    borderColor: colors,
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#8888b0',
                            padding: 14,
                            font: { size: 11, weight: '500' },
                            usePointStyle: true,
                            pointStyle: 'rectRounded'
                        }
                    },
                    tooltip: {
                        backgroundColor: '#16162a',
                        titleColor: '#eeeeff',
                        bodyColor: '#8888b0',
                        borderColor: 'rgba(255,255,255,0.06)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: ctx => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
                                return ' ' + ctx.label + ': ' + ctx.parsed + ' (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    },

    /* ========== SIDEBAR ========== */

    updateSidebarProgress() {
        const bar = document.getElementById('sidebarProgress');
        if (!bar) return;
        const revenue = this.getTotalRevenue();
        const goal = this.state.settings.goal;
        const pct = Math.min(100, Math.round((revenue / goal) * 100));
        bar.style.width = pct + '%';
    },

    /* ========== UTILS ========== */

    id() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },

    fmt(n) {
        return n.toFixed(2) + ' ' + this.state.settings.currency;
    },

    fmtDate(d) {
        if (!d) return '-';
        const parts = d.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
    },

    esc(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    },

    statusLabel(s) {
        const map = { en_vente: 'En vente', vendu: 'Vendu', expedie: 'Expédié', livre: 'Livré', retourne: 'Retourné' };
        return map[s] || s;
    },

    catLabel(c) {
        const map = { vente: 'Vente', achat: 'Achat', frais_port: 'Frais port', commission: 'Commission', autre: 'Autre' };
        return map[c] || c;
    },

    getTotalRevenue() {
        return this.state.transactions.filter(t => t.type === 'revenu').reduce((s, t) => s + t.amount, 0);
    },

    getTotalExpenses() {
        return this.state.transactions.filter(t => t.type === 'depense').reduce((s, t) => s + t.amount, 0);
    },

    getSoldCount() {
        return this.state.items.filter(i => i.status === 'vendu').length;
    },

    toast(msg, type = 'info') {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const config = {
            success: { icon: 'fa-check-circle', title: 'Succès', color: 'var(--success)' },
            error: { icon: 'fa-exclamation-circle', title: 'Erreur', color: 'var(--danger)' },
            info: { icon: 'fa-info-circle', title: 'Info', color: 'var(--accent)' }
        };
        const c = config[type] || config.info;
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<div class="toast-icon" style="color:${c.color};background:${c.color}15"><i class="fas ${c.icon}"></i></div>
            <div class="toast-content">
                <div class="toast-title">${c.title}</div>
                <div class="toast-msg">${this.esc(msg)}</div>
            </div>
            <button class="toast-close"><i class="fas fa-times"></i></button>`;
        t.querySelector('.toast-close').addEventListener('click', () => {
            t.style.opacity = '0';
            t.style.transform = 'translateX(40px)';
            setTimeout(() => t.remove(), 300);
        });
        container.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            t.style.transform = 'translateX(40px)';
            t.style.transition = 'all 0.3s ease';
            setTimeout(() => t.remove(), 300);
        }, 4000);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
