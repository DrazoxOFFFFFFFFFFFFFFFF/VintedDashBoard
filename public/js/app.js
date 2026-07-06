const API = window.location.origin + '/api';

function getToken() {
  const t = localStorage.getItem('token');
  if (!t) { window.location.href = '/'; return null }
  return t;
}

async function api(path, opts = {}) {
  const token = getToken();
  if (!token) return;
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...opts.headers }
  });
  if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/'; return }
  return res.json();
}

const App = {
    state: { items: [], transactions: [], settings: { goal: 2000, currency: '€' } },
    charts: { sales: null, status: null, profit: null },
    currentPage: 'dashboard',
    loaded: false,

    async init() {
        if (!getToken()) return;
        await this.loadData();
        this.setupNavigation();
        this.setupLogout();
        this.setupAdminLink();
        this.navigate('dashboard');
    },

    setupAdminLink() {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const link = document.getElementById('adminLink');
        if (link && user.is_admin) {
            link.style.display = 'flex';
            link.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/admin';
            });
        }
    },

    async loadData() {
        try {
            const [items, transactions, settings] = await Promise.all([
                api('/items'), api('/transactions'), api('/settings')
            ]);
            if (items) this.state.items = items;
            if (transactions) this.state.transactions = transactions;
            if (settings) this.state.settings = { ...this.state.settings, ...settings };
            this.loaded = true;
        } catch (e) {
            this.toast('Erreur de chargement des données', 'error');
        }
    },

    async saveData() {},

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const page = el.dataset.page;
                this.navigate(page);
            });
        });
    },

    setupLogout() {
        const btn = document.getElementById('logoutBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/';
            });
        }
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
            case 'dashboard': this.renderDashboard(container); break;
            case 'stock': this.renderStock(container); break;
            case 'accounting': this.renderAccounting(container); break;
            case 'goals': this.renderGoals(container); break;
            case 'suppliers': this.renderSuppliers(container); break;
            case 'enhance': this.renderEnhance(container); break;
        }
        this.updateSidebarProgress();
        this.updateNavBadges();
    },

    updateNavBadges() {
        const badge = document.querySelector('.nav-item[data-page="stock"] .nav-badge');
        if (badge) badge.textContent = this.state.items.length;
    },

    updateSidebarGoal() {
        const el = document.getElementById('sidebarGoal');
        if (el) el.textContent = this.fmt(this.state.settings.goal);
    },

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
            container.appendChild(wrap); return;
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
            tr.innerHTML = `
                <td style="font-size:0.8rem;color:var(--text-muted)"><i class="far fa-calendar-alt"></i> ${this.fmtDate(t.date)}</td>
                <td style="color:var(--text-primary)"><i class="fas ${isRevenue ? 'fa-arrow-up' : 'fa-arrow-down'}" style="font-size:0.65rem;color:${isRevenue ? 'var(--success)' : 'var(--danger)'};margin-right:8px"></i>${this.esc(t.description)}</td>
                <td><span class="status-badge ${isRevenue ? 'vendu' : 'retourne'}"><i class="fas ${isRevenue ? 'fa-check' : 'fa-times'}"></i> ${isRevenue ? 'Revenu' : 'Dépense'}</span></td>
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
            this.h('h1', {}, this.h('i', { className: 'fas fa-box' }), ' Gestion du Stock'),
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
                    <option value="en_vente">En vente</option>
                    <option value="vendu">Vendu</option>
                    <option value="expedie">Expédié</option>
                    <option value="livre">Livré</option>
                    <option value="retourne">Retourné</option>
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
        statusFilter.innerHTML = '<option value="all">Tous les statuts</option><option value="en_vente">En vente</option><option value="vendu">Vendu</option><option value="expedie">Expédié</option><option value="livre">Livré</option><option value="retourne">Retourné</option>';
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
            </div>`; return;
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

    async handleAddItem(e) {
        e.preventDefault();
        const name = document.getElementById('itemName').value.trim();
        const purchasePrice = parseFloat(document.getElementById('itemPurchasePrice').value) || 0;
        const sellingPrice = parseFloat(document.getElementById('itemSellingPrice').value) || 0;
        const status = document.getElementById('itemStatus').value;
        if (!name) { this.toast('Veuillez entrer un nom d\'article', 'error'); return; }
        const item = {
            id: this.id(), name, purchasePrice, sellingPrice, status,
            dateAdded: new Date().toISOString().split('T')[0],
            dateSold: status === 'vendu' ? new Date().toISOString().split('T')[0] : null
        };
        const result = await api('/items', { method: 'POST', body: JSON.stringify(item) });
        if (!result) return;
        this.state.items.unshift(item);
        if (status === 'vendu') {
            this.state.transactions.push({ id: this.id(), type: 'revenu', amount: sellingPrice, description: `Vente: ${name}`, category: 'vente', date: item.dateAdded, itemId: item.id });
            this.state.transactions.push({ id: this.id(), type: 'depense', amount: purchasePrice, description: `Achat: ${name}`, category: 'achat', date: item.dateAdded, itemId: item.id });
        }
        document.getElementById('stockForm').reset();
        this.renderStockTable();
        this.updateNavBadges();
        this.toast(`"${name}" ajouté avec succès`, 'success');
    },

    async handleDeleteItem(id) {
        if (!confirm('Supprimer cet article définitivement ?')) return;
        const result = await api('/items/' + id, { method: 'DELETE' });
        if (!result) return;
        this.state.items = this.state.items.filter(i => i.id !== id);
        this.state.transactions = this.state.transactions.filter(t => t.itemId !== id);
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
        overlay.querySelector('#editForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const oldStatus = item.status;
            item.name = document.getElementById('editName').value.trim();
            item.purchasePrice = parseFloat(document.getElementById('editPurchase').value) || 0;
            item.sellingPrice = parseFloat(document.getElementById('editSelling').value) || 0;
            item.status = document.getElementById('editStatus').value;
            if (item.status === 'vendu' && !item.dateSold) item.dateSold = new Date().toISOString().split('T')[0];
            if (item.status !== 'vendu') item.dateSold = null;

            const result = await api('/items/' + item.id, { method: 'PUT', body: JSON.stringify(item) });
            if (!result) return;

            this.syncTransactions(item, oldStatus);
            this.renderStockTable();
            overlay.remove();
            this.toast('Article modifié', 'success');
        });
    },

    syncTransactions(item, oldStatus) {
        this.state.transactions = this.state.transactions.filter(t => t.itemId !== item.id);
        if (item.status === 'vendu') {
            this.state.transactions.push({ id: this.id(), type: 'revenu', amount: item.sellingPrice, description: `Vente: ${item.name}`, category: 'vente', date: item.dateSold || new Date().toISOString().split('T')[0], itemId: item.id });
            this.state.transactions.push({ id: this.id(), type: 'depense', amount: item.purchasePrice, description: `Achat: ${item.name}`, category: 'achat', date: item.dateAdded, itemId: item.id });
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
            this.h('h1', {}, this.h('i', { className: 'fas fa-euro-sign' }), ' Comptabilité'),
            this.h('div', { className: 'header-meta' },
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` Marge: ${profitPct}%`),
                this.h('span', {}, this.h('i', { className: 'fas fa-circle' }), ` ${this.state.transactions.length} opérations`)
            )
        ));
        const kpiGrid = this.h('div', { className: 'kpi-grid' });
        [{ icon: 'fa-circle-arrow-up', label: 'Revenus', value: this.fmt(revenue), color: 'success', bgIcon: 'fa-chart-bar', trend: '+100%' },
         { icon: 'fa-circle-arrow-down', label: 'Dépenses', value: this.fmt(expenses), color: 'danger', bgIcon: 'fa-chart-bar', trend: '-100%' },
         { icon: 'fa-calculator', label: 'Bénéfice Net', value: this.fmt(profit), color: profit >= 0 ? 'success' : 'danger', bgIcon: 'fa-coins', trend: profitPct + '%' }
        ].forEach((k, i) => {
            const card = this.h('div', { className: `kpi-card ${k.color} animate-in d${i + 1}` });
            card.innerHTML = `<i class="fas ${k.bgIcon} card-bg-icon"></i>`;
            card.appendChild(this.h('div', { className: 'kpi-header' },
                this.h('div', { className: `kpi-icon ${k.color}` }, this.h('i', { className: `fas ${k.icon}` })),
                this.h('div', { className: `kpi-trend ${k.color === 'danger' ? 'down' : 'up'}` },
                    this.h('i', { className: `fas fa-${k.color === 'danger' ? 'caret-down' : 'caret-up'}` }), k.trend)
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
                    <option value="revenu">Revenu</option>
                    <option value="depense">Dépense</option>
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
            </div>`; return;
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
            tr.querySelector('.delete-trans').addEventListener('click', async () => {
                const result = await api('/transactions/' + t.id, { method: 'DELETE' });
                if (!result) return;
                this.state.transactions = this.state.transactions.filter(x => x.id !== t.id);
                this.renderTransactionTable();
                this.toast('Transaction supprimée', 'info');
            });
            tbody.appendChild(tr);
        });
        wrap.innerHTML = '';
        wrap.appendChild(table);
    },

    async handleAddTransaction(e) {
        e.preventDefault();
        const type = document.getElementById('transType').value;
        const amount = parseFloat(document.getElementById('transAmount').value) || 0;
        const category = document.getElementById('transCategory').value;
        const description = document.getElementById('transDescription').value.trim();
        if (!amount || amount <= 0) { this.toast('Montant invalide', 'error'); return; }
        if (!description) { this.toast('Description requise', 'error'); return; }
        const txn = { id: this.id(), type, amount, category, description, date: new Date().toISOString().split('T')[0], itemId: null };
        const result = await api('/transactions', { method: 'POST', body: JSON.stringify(txn) });
        if (!result) return;
        this.state.transactions.push(txn);
        document.getElementById('transactionForm').reset();
        this.renderTransactionTable();
        this.toast('Transaction ajoutée', 'success');
    },

    /* ========== SUPPLIERS ========== */

    async renderSuppliers(container) {
      container.innerHTML = '';
      container.appendChild(this.h('div', { className: 'page-header' },
        this.h('h1', {}, this.h('i', { className: 'fas fa-truck' }), ' Fournisseurs')
      ));

      const searchBar = this.h('div', { style: 'display:flex;gap:12px;margin-bottom:20px;max-width:900px;margin-left:auto;margin-right:auto' });
      searchBar.innerHTML = `
        <div class="search-box" style="flex:1">
          <i class="fas fa-search"></i>
          <input type="text" id="supplierSearch" placeholder="Rechercher un fournisseur..." style="width:100%">
        </div>
        <select id="supplierCategory" class="filter-select">
          <option value="all">Toutes catégories</option>
          <option value="general">Général</option>
          <option value="vetements">Vêtements</option>
          <option value="chaussures">Chaussures</option>
          <option value="accessoires">Accessoires</option>
          <option value="electronique">Électronique</option>
          <option value="maison">Maison</option>
        </select>
      `;
      container.appendChild(searchBar);

      const grid = this.h('div', { id: 'supplierGrid', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;max-width:1100px;margin:0 auto' });
      container.appendChild(grid);

      const data = await api('/suppliers');
      if (!data || !data.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-truck"></i><p>Aucun fournisseur pour le moment</p></div>';
        return;
      }

      this.suppliers = data;
      const doFilter = () => this.renderSupplierGrid();
      document.getElementById('supplierSearch').addEventListener('input', doFilter);
      document.getElementById('supplierCategory').addEventListener('change', doFilter);
      this.renderSupplierGrid();
    },

    renderSupplierGrid() {
      const grid = document.getElementById('supplierGrid');
      if (!grid) return;
      const query = (document.getElementById('supplierSearch')?.value || '').toLowerCase();
      const cat = document.getElementById('supplierCategory')?.value || 'all';

      let items = this.suppliers;
      if (cat !== 'all') items = items.filter(s => s.category === cat);
      if (query) items = items.filter(s => (s.name || '').toLowerCase().includes(query));

      if (!items.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-search"></i><p>Aucun résultat</p></div>';
        return;
      }

      grid.innerHTML = '';
      items.forEach(s => {
        const card = this.h('div', { className: 'form-card', style: 'overflow:hidden;padding:0' });
        const imgHtml = s.image_url ? `<img src="${this.esc(s.image_url)}" alt="${this.esc(s.name)}" style="width:100%;height:200px;object-fit:cover;border-bottom:1px solid var(--border)" onerror="this.style.display='none'">` : '<div style="height:120px;display:flex;align-items:center;justify-content:center;background:var(--bg-card);border-bottom:1px solid var(--border);color:var(--text-muted)"><i class="fas fa-box" style="font-size:2rem;opacity:0.2"></i></div>';
        card.innerHTML = imgHtml + `
          <div style="padding:14px">
            <h3 style="font-size:0.95rem;font-weight:600;margin:0 0 4px;color:var(--text-primary)">${this.esc(s.name)}</h3>

            ${s.price > 0 ? `<div style="font-size:1.1rem;font-weight:700;color:var(--accent);margin-bottom:8px">${s.price.toFixed(2)} €</div>` : ''}
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${s.url ? `<a href="${this.esc(s.url)}" target="_blank" class="btn btn-primary btn-xs" style="flex:1;justify-content:center;text-decoration:none"><i class="fas fa-external-link-alt"></i> Voir l'offre</a>` : ''}
              ${s.stock_info ? `<span class="status-badge ${s.stock_info === 'en_stock' || s.stock_info === 'in_stock' ? 'vendu' : 'retourne'}"><i class="fas ${s.stock_info === 'en_stock' || s.stock_info === 'in_stock' ? 'fa-check' : 'fa-clock'}"></i> ${s.stock_info}</span>` : ''}
              ${s.category !== 'general' ? `<span class="status-badge" style="background:var(--accent-glow)"><i class="fas fa-tag"></i> ${s.category}</span>` : ''}
            </div>
          </div>`;
        grid.appendChild(card);
      });
    },

    /* ========== ENHANCE ========== */

    renderEnhance(container) {
        container.innerHTML = '';
        container.appendChild(this.h('div', { className: 'page-header' },
            this.h('h1', {}, this.h('i', { className: 'fas fa-wand-magic-sparkles' }), ' Amélioration IA')
        ));

        const infoBanner = this.h('div', { style: 'background:var(--accent-glow);border:1px solid var(--accent);border-radius:10px;padding:12px 16px;margin-bottom:20px;max-width:900px;margin-left:auto;margin-right:auto;font-size:0.8rem;color:var(--text-secondary)' });
        infoBanner.innerHTML = '<i class="fas fa-robot" style="color:var(--accent);margin-right:8px"></i> Suppression IA du fond + nettoyage automatique. Résultat propre, fond dégradé, téléchargement direct.';
        container.appendChild(infoBanner);

        const grid = this.h('div', { className: 'enhance-grid', style: 'display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px;margin:0 auto' });

        /* Upload card */
        const uploadCard = this.h('div', { className: 'form-card' });
        uploadCard.innerHTML = `<div class="form-title"><i class="fas fa-cloud-arrow-up"></i> Image originale</div>
            <div class="enhance-upload" id="enhanceDrop" style="border:2px dashed var(--border);border-radius:12px;padding:40px;text-align:center;cursor:pointer;transition:0.3s">
                <i class="fas fa-image" style="font-size:3rem;color:var(--accent);opacity:0.3;margin-bottom:12px"></i>
                <p style="color:var(--text-muted);margin-bottom:8px">Dépose une image ici ou clique pour choisir</p>
                <p style="font-size:0.7rem;color:var(--text-muted)">PNG, JPG — Max 10 Mo</p>
                <input type="file" id="enhanceFile" accept="image/*" hidden>
            </div>
            <div id="enhancePreview" style="display:none;margin-top:16px">
                <img id="enhancePreviewImg" style="width:100%;border-radius:10px;border:1px solid var(--border)">
                <button class="btn btn-ghost btn-xs" id="enhanceChangeBtn" style="margin-top:8px;width:100%"><i class="fas fa-rotate"></i> Changer d'image</button>
            </div>`;
        grid.appendChild(uploadCard);

        /* Settings card */
        const settingsCard = this.h('div', { className: 'form-card' });
        settingsCard.innerHTML = `<div class="form-title"><i class="fas fa-sliders"></i> Réglages</div>
            <div class="form-group">
                <label><i class="fas fa-sun"></i> Luminosité</label>
                <input type="range" id="enhBrightness" min="-50" max="50" value="10" style="width:100%">
                <span style="font-size:0.7rem;color:var(--text-muted)" id="enhBrightnessVal">+10</span>
            </div>
            <div class="form-group">
                <label><i class="fas fa-adjust"></i> Contraste</label>
                <input type="range" id="enhContrast" min="-50" max="50" value="15" style="width:100%">
                <span style="font-size:0.7rem;color:var(--text-muted)" id="enhContrastVal">+15</span>
            </div>
            <div class="form-group">
                <label><i class="fas fa-palette"></i> Saturation</label>
                <input type="range" id="enhSaturation" min="-50" max="50" value="10" style="width:100%">
                <span style="font-size:0.7rem;color:var(--text-muted)" id="enhSaturationVal">+10</span>
            </div>
            <div class="form-group">
                <label><i class="fas fa-crosshairs"></i> Netteté</label>
                <input type="range" id="enhSharpen" min="0" max="10" value="3" step="0.5" style="width:100%">
                <span style="font-size:0.7rem;color:var(--text-muted)" id="enhSharpenVal">3</span>
            </div>
            <div class="form-group">
                <label><i class="fas fa-fill-drip"></i> Fond</label>
                <select id="enhBgColor" style="width:100%">
                    <option value="#ffffff">Blanc</option>
                    <option value="#f0f0f0">Gris clair</option>
                    <option value="#e8e0d8">Beige</option>
                    <option value="#000000">Noir</option>
                    <option value="transparent">Transparent</option>
                </select>
            </div>
            <div class="form-group" style="margin:0">
                <label><input type="checkbox" id="enhRemoveBg" checked> <i class="fas fa-eraser"></i> Supprimer le fond clair</label>
            </div>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-primary" id="enhanceBtn" disabled style="width:100%"><i class="fas fa-wand-magic-sparkles"></i> Améliorer l'image</button>
            </div>`;

        [['enhBrightness','enhBrightnessVal'],['enhContrast','enhContrastVal'],['enhSaturation','enhSaturationVal'],['enhSharpen','enhSharpenVal']].forEach(([id,valId]) => {
            const el = settingsCard.querySelector('#' + id);
            if (el) el.addEventListener('input', () => {
                const v = el.value;
                const label = settingsCard.querySelector('#' + valId);
                if (label) label.textContent = (v > 0 ? '+' : '') + v;
            });
        });
        grid.appendChild(settingsCard);
        container.appendChild(grid);

        /* Result area */
        const resultCard = this.h('div', { className: 'form-card', style: 'max-width:900px;margin:20px auto 0;display:none', id: 'enhanceResult' });
        resultCard.innerHTML = `<div class="form-title"><i class="fas fa-check-circle" style="color:var(--success)"></i> Image améliorée</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div><p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px">Avant</p><img id="enhanceBefore" style="width:100%;border-radius:10px;border:1px solid var(--border)"></div>
                <div><p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px">Après</p><img id="enhanceAfter" style="width:100%;border-radius:10px;border:1px solid var(--accent)"></div>
            </div>
            <div class="form-actions" style="margin-top:16px">
                <a class="btn btn-primary" id="enhanceDownloadBtn" download="image-amelioree.jpg"><i class="fas fa-download"></i> Télécharger</a>
                <button class="btn btn-ghost" id="enhanceResetBtn"><i class="fas fa-rotate-left"></i> Recommencer</button>
            </div>`;
        container.appendChild(resultCard);

        /* Spinner */
        const spinner = document.createElement('div');
        spinner.id = 'enhanceSpinner';
        spinner.style.cssText = 'display:none;text-align:center;padding:40px';
        spinner.innerHTML = '<div class="spinner" style="width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px"></div><p style="color:var(--text-muted);font-size:0.85rem">Traitement en cours...</p><p style="color:var(--text-muted);font-size:0.7rem">Redimensionnement, nettoyage du fond, amélioration...</p>';
        container.appendChild(spinner);

        if (!document.getElementById('enhanceStyle')) {
            const style = document.createElement('style');
            style.id = 'enhanceStyle';
            style.textContent = '@keyframes spin { to { transform: rotate(360deg) } }';
            document.head.appendChild(style);
        }

        this.bindEnhanceEvents(container);
    },

    bindEnhanceEvents(container) {
        const drop = document.getElementById('enhanceDrop');
        const fileInput = document.getElementById('enhanceFile');
        const preview = document.getElementById('enhancePreview');
        const previewImg = document.getElementById('enhancePreviewImg');
        const changeBtn = document.getElementById('enhanceChangeBtn');
        const enhanceBtn = document.getElementById('enhanceBtn');
        const spinner = document.getElementById('enhanceSpinner');
        const resultCard = document.getElementById('enhanceResult');

        let currentFile = null;

        function showFile(file) {
            if (!file) return;
            currentFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImg.src = e.target.result;
                preview.style.display = 'block';
                drop.style.display = 'none';
                enhanceBtn.disabled = false;
            };
            reader.readAsDataURL(file);
        }

        drop.addEventListener('click', () => fileInput.click());
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; });
        drop.addEventListener('dragleave', () => drop.style.borderColor = 'var(--border)');
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--border)'; showFile(e.dataTransfer.files[0]); });
        fileInput.addEventListener('change', () => showFile(fileInput.files[0]));
        changeBtn.addEventListener('click', () => { currentFile = null; preview.style.display = 'none'; drop.style.display = 'block'; enhanceBtn.disabled = true; resultCard.style.display = 'none'; fileInput.value = ''; });

        enhanceBtn.addEventListener('click', async () => {
            if (!currentFile) return;

            spinner.style.display = 'block';
            enhanceBtn.disabled = true;
            resultCard.style.display = 'none';

            const form = new FormData();
            form.append('image', currentFile);
            form.append('brightness', document.getElementById('enhBrightness').value);
            form.append('contrast', document.getElementById('enhContrast').value);
            form.append('saturation', document.getElementById('enhSaturation').value);
            form.append('sharpen', document.getElementById('enhSharpen').value);
            form.append('bgColor', document.getElementById('enhBgColor').value);
            form.append('removeBg', document.getElementById('enhRemoveBg').checked ? 'true' : 'false');

            try {
                const token = getToken();
                const res = await fetch(API + '/enhance', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: form
                });
                const data = await res.json();
                if (!res.ok) { this.toast(data.error || 'Erreur', 'error'); spinner.style.display = 'none'; enhanceBtn.disabled = false; return; }

                document.getElementById('enhanceBefore').src = previewImg.src;
                document.getElementById('enhanceAfter').src = window.location.origin + data.url;
                document.getElementById('enhanceDownloadBtn').href = window.location.origin + data.url;
                resultCard.style.display = 'block';
                this.toast('Image améliorée !', 'success');
            } catch (e) {
                this.toast('Erreur réseau', 'error');
            }
            spinner.style.display = 'none';
            enhanceBtn.disabled = false;
        });

        const resetBtn = document.getElementById('enhanceResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                resultCard.style.display = 'none';
                currentFile = null;
                preview.style.display = 'none';
                drop.style.display = 'block';
                enhanceBtn.disabled = true;
                fileInput.value = '';
            });
        }
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
            this.h('h1', {}, this.h('i', { className: 'fas fa-bullseye' }), ' Objectifs'),
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
            </div>
            <div style="margin-top:20px">
                <button class="btn btn-primary btn-sm" id="editGoalBtn"><i class="fas fa-pen"></i> Modifier l'objectif</button>
            </div>`;
        container.appendChild(hero);

        const remainder = goal - revenue;
        const avgPrice = items.length && sold ? revenue / sold : 0;
        const itemsToGo = avgPrice > 0 ? Math.ceil(remainder / avgPrice) : '-';

        const stats = [
            { icon: 'fa-shirt', value: sold, label: 'Articles vendus' },
            { icon: 'fa-coins', value: profit >= 0 ? this.fmt(profit) : '-' + this.fmt(Math.abs(profit)), label: 'Bénéfice total' },
            { icon: 'fa-calculator', value: sold ? this.fmt(revenue / sold) : '0 ' + this.state.settings.currency, label: 'Prix moyen vente' },
            { icon: 'fa-percentage', value: items.length ? Math.round((sold / items.length) * 100) + '%' : '0%', label: 'Taux de vente' },
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

        const editBtn = document.getElementById('editGoalBtn');
        if (editBtn) {
            editBtn.addEventListener('click', () => this.showEditGoalModal());
        }
    },

    showEditGoalModal() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <h2><i class="fas fa-bullseye"></i> Modifier l'objectif</h2>
                <form id="goalForm">
                    <div class="form-group">
                        <label><i class="fas fa-euro-sign"></i> Objectif de revenus</label>
                        <input type="number" id="goalInput" value="${this.state.settings.goal}" step="100" min="0" required>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-coins"></i> Devise</label>
                        <select id="currencyInput">
                            <option value="€" ${this.state.settings.currency === '€' ? 'selected' : ''}>€ Euro</option>
                            <option value="$" ${this.state.settings.currency === '$' ? 'selected' : ''}>$ Dollar</option>
                            <option value="£" ${this.state.settings.currency === '£' ? 'selected' : ''}>£ Livre</option>
                        </select>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-ghost" id="cancelGoal"><i class="fas fa-times"></i> Annuler</button>
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#cancelGoal').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#goalForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const goal = parseFloat(document.getElementById('goalInput').value) || 2000;
            const currency = document.getElementById('currencyInput').value;
            const result = await api('/settings', { method: 'PUT', body: JSON.stringify({ goal, currency }) });
            if (!result) return;
            this.state.settings.goal = goal;
            this.state.settings.currency = currency;
            this.updateSidebarGoal();
            overlay.remove();
            this.navigate('goals');
            this.toast('Objectif mis à jour', 'success');
        });
    },

    /* ========== CHARTS ========== */

    initDashboardCharts() {
        setTimeout(() => { this.initSalesChart(); this.initStatusChart(); }, 100);
    },

    destroyCharts() {
        if (this.charts.sales) { this.charts.sales.destroy(); this.charts.sales = null; }
        if (this.charts.status) { this.charts.status.destroy(); this.charts.status = null; }
    },

    initSalesChart() {
        const canvas = document.getElementById('salesChart');
        if (!canvas || typeof Chart === 'undefined') return;
        const days = 30; const labels = []; const sales = []; const expenses = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now); d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            labels.push(dateStr.slice(5));
            sales.push(this.state.transactions.filter(t => t.type === 'revenu' && t.date === dateStr).reduce((s, t) => s + t.amount, 0));
            expenses.push(this.state.transactions.filter(t => t.type === 'depense' && t.date === dateStr).reduce((s, t) => s + t.amount, 0));
        }
        const ctx = canvas.getContext('2d');
        this.charts.sales = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Revenus', data: sales, borderColor: '#00e676',
                    backgroundColor: 'rgba(0, 230, 118, 0.08)', fill: true, tension: 0.4,
                    pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#00e676',
                    pointBorderColor: '#00e676', pointBorderWidth: 0, borderWidth: 2.5
                }, {
                    label: 'Dépenses', data: expenses, borderColor: '#ff5252',
                    backgroundColor: 'rgba(255, 82, 82, 0.05)', fill: true, tension: 0.4,
                    pointRadius: 2, pointHoverRadius: 5, pointBackgroundColor: '#ff5252',
                    pointBorderColor: '#ff5252', pointBorderWidth: 0, borderWidth: 1.5, borderDash: [5, 5]
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top', align: 'end', labels: { color: '#8888b0', padding: 16, font: { size: 11, weight: '500' }, usePointStyle: true, pointStyle: 'circle' } },
                    tooltip: { backgroundColor: '#16162a', titleColor: '#eeeeff', bodyColor: '#8888b0', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + ' ' + this.state.settings.currency } }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }, ticks: { color: '#505070', maxTicksLimit: 8, font: { size: 10 } } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#505070', font: { size: 10 }, callback: v => v + this.state.settings.currency }, beginAtZero: true }
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
        const ctx = canvas.getContext('2d');
        this.charts.status = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data: counts, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 2, hoverOffset: 8 }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '68%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#8888b0', padding: 14, font: { size: 11, weight: '500' }, usePointStyle: true, pointStyle: 'rectRounded' } },
                    tooltip: { backgroundColor: '#16162a', titleColor: '#eeeeff', bodyColor: '#8888b0', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: ctx => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0; return ' ' + ctx.label + ': ' + ctx.parsed + ' (' + pct + '%)' } } }
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
        this.updateSidebarGoal();
    },

    /* ========== UTILS ========== */

    id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
    fmt(n) { return (n || 0).toFixed(2) + ' ' + this.state.settings.currency; },
    fmtDate(d) { if (!d) return '-'; const parts = d.split('-'); return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : d; },
    esc(s) { const div = document.createElement('div'); div.textContent = s; return div.innerHTML; },
    statusLabel(s) { const map = { en_vente: 'En vente', vendu: 'Vendu', expedie: 'Expédié', livre: 'Livré', retourne: 'Retourné' }; return map[s] || s; },
    catLabel(c) { const map = { vente: 'Vente', achat: 'Achat', frais_port: 'Frais port', commission: 'Commission', autre: 'Autre' }; return map[c] || c; },
    getTotalRevenue() { return this.state.transactions.filter(t => t.type === 'revenu').reduce((s, t) => s + t.amount, 0); },
    getTotalExpenses() { return this.state.transactions.filter(t => t.type === 'depense').reduce((s, t) => s + t.amount, 0); },
    getSoldCount() { return this.state.items.filter(i => i.status === 'vendu').length; },

    toast(msg, type = 'info') {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const config = { success: { icon: 'fa-check-circle', title: 'Succès', color: 'var(--success)' }, error: { icon: 'fa-exclamation-circle', title: 'Erreur', color: 'var(--danger)' }, info: { icon: 'fa-info-circle', title: 'Info', color: 'var(--accent)' } };
        const c = config[type] || config.info;
        const t = document.createElement('div');
        t.className = 'toast ' + type;
        t.innerHTML = '<div class="toast-icon" style="color:' + c.color + ';background:' + c.color + '15"><i class="fas ' + c.icon + '"></i></div><div class="toast-content"><div class="toast-title">' + c.title + '</div><div class="toast-msg">' + this.esc(msg) + '</div></div><button class="toast-close"><i class="fas fa-times"></i></button>';
        t.querySelector('.toast-close').addEventListener('click', () => { t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; setTimeout(() => t.remove(), 300); });
        container.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; t.style.transition = 'all 0.3s ease'; setTimeout(() => t.remove(), 300); }, 4000);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
