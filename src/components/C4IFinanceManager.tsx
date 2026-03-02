import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { DollarSign, TrendingUp, TrendingDown, Plus, CreditCard, List, PieChart as PieChartIcon, Target } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface FinanceTransaction {
    id: string;
    transaction_type: 'ingreso' | 'egreso';
    amount: number;
    category: string;
    description: string;
    reference_date: string;
    created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
    'Logística': '#3B82F6',   // Blue
    'Propaganda': '#8B5CF6', // Purple
    'Nómina': '#10B981',     // Green
    'Donación': '#F59E0B',   // Yellow
    'Operatividad': '#EF4444',// Red
    'Otros': '#64748B'       // Slate
};

export const C4IFinanceManager = () => {
    const { user } = useAuth();
    const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [isCreating, setIsCreating] = useState(false);
    const [type, setType] = useState<'ingreso' | 'egreso'>('egreso');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('Logística');
    const [description, setDescription] = useState('');
    const [refDate, setRefDate] = useState(new Date().toISOString().split('T')[0]);

    const fetchFinances = async () => {
        if (!user?.tenant_id) return;

        // Auto-create table logic via an RPC trick or just by catching the 42P01 error
        // Actually since we don't have an RPC for table creation, we rely on the error.
        // Let's first try to fetch.

        const { data, error } = await supabase
            .from('campaign_finances')
            .select('*')
            .eq('tenant_id', user.tenant_id)
            .order('reference_date', { ascending: false });

        if (error) {
            console.error("Error fetching finances:", error);
            if (error.code === '42P01') {
                alert("La tabla de Finanzas no existe en la BD. Contacte a Soporte (SuperAdmin).");
            }
        } else {
            setTransactions(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchFinances();
    }, [user?.tenant_id]);

    const handleCreateTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const numAmount = parseFloat(amount.replace(/,/g, ''));
            if (isNaN(numAmount) || numAmount <= 0) {
                alert("Por favor ingrese un monto válido.");
                return;
            }

            const { error } = await supabase.from('campaign_finances').insert([{
                tenant_id: user?.tenant_id,
                transaction_type: type,
                amount: numAmount,
                category: type === 'ingreso' ? 'Aportación' : category, // Force "Aportación" for income simplified
                description,
                reference_date: refDate
            }]);

            if (error) throw error;

            alert("Transacción registrada con éxito.");
            setIsCreating(false);
            setAmount('');
            setDescription('');
            fetchFinances();
        } catch (error: any) {
            alert("Error al registrar transacción: " + error.message);
        }
    };

    // Calculate aggregations
    const totalIngresos = transactions.filter(t => t.transaction_type === 'ingreso').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalEgresos = transactions.filter(t => t.transaction_type === 'egreso').reduce((sum, t) => sum + Number(t.amount), 0);
    const balance = totalIngresos - totalEgresos;

    // Data for Donut Chart (Expenses by Category)
    const egresosDataRaw: Record<string, number> = {};
    transactions.filter(t => t.transaction_type === 'egreso').forEach(t => {
        egresosDataRaw[t.category] = (egresosDataRaw[t.category] || 0) + Number(t.amount);
    });
    const donutData = Object.keys(egresosDataRaw).map(key => ({
        name: key,
        value: egresosDataRaw[key]
    })).sort((a, b) => b.value - a.value);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
    };

    if (loading) return <div style={{ color: 'var(--tertiary)' }}>Cargando datos contables...</div>;

    return (
        <div className="flex-col gap-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ color: 'white', fontFamily: 'Oswald', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', textShadow: '0 0 10px var(--tertiary)' }}>
                    <CreditCard color="var(--tertiary)" /> CONTROL PRESUPUESTAL
                </h3>

                {!isCreating && (
                    <button className="primary-btn" onClick={() => setIsCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                        <Plus size={16} /> REGISTRAR MOVIMIENTO
                    </button>
                )}
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {/* Ingresos */}
                <div className="glow-success" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10B981', padding: '1rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10B981', marginBottom: '0.5rem' }}>
                        <TrendingUp size={20} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', fontFamily: 'Inter' }}>PRESUPUESTO GBL</span>
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white', fontFamily: 'Oswald', textShadow: '0 0 10px rgba(16, 185, 129, 0.4)' }}>
                        {formatCurrency(totalIngresos)}
                    </div>
                </div>


                {/* Egresos */}
                <div className="glow-error" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #EF4444', padding: '1rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#EF4444', marginBottom: '0.5rem' }}>
                        <TrendingDown size={20} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', fontFamily: 'Inter' }}>GASTO EJERCIDO</span>
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white', fontFamily: 'Oswald', textShadow: '0 0 10px rgba(239, 68, 68, 0.4)' }}>
                        {formatCurrency(totalEgresos)}
                    </div>
                </div>


                {/* Balance */}
                <div className="glow-tertiary" style={{ backgroundColor: 'rgba(0, 212, 255, 0.1)', border: '1px solid var(--tertiary)', padding: '1rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--tertiary)', marginBottom: '0.5rem' }}>
                        <Target size={20} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', fontFamily: 'Inter' }}>BALANCE (RESERVAS)</span>
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: balance >= 0 ? 'white' : '#EF4444', fontFamily: 'Oswald', textShadow: '0 0 10px rgba(0, 212, 255, 0.4)' }}>
                        {formatCurrency(balance)}
                    </div>
                </div>

            </div>

            {isCreating && (
                <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--tertiary)', marginTop: '1rem' }}>
                    <h4 style={{ color: 'var(--tertiary)', marginTop: 0, fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <DollarSign size={18} /> DETALLE OPERATIVO
                    </h4>
                    <form onSubmit={handleCreateTransaction} className="flex-col gap-3">
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.3rem', display: 'block' }}>Tipo Operación</label>
                                <select className="squishy-input" value={type} onChange={e => setType(e.target.value as any)} style={{ width: '100%', marginBottom: 0 }}>
                                    <option value="ingreso">🟢 Ingreso / Aportación</option>
                                    <option value="egreso">🔴 Egreso / Gasto</option>
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.3rem', display: 'block' }}>Fecha Reflexión</label>
                                <input type="date" className="squishy-input" value={refDate} onChange={e => setRefDate(e.target.value)} required style={{ width: '100%', marginBottom: 0 }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.3rem', display: 'block' }}>Monto (MXN)</label>
                                <input type="number" step="0.01" className="squishy-input" placeholder="ej. 15000.50" value={amount} onChange={e => setAmount(e.target.value)} required style={{ width: '100%', marginBottom: 0 }} />
                            </div>
                            {type === 'egreso' && (
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.3rem', display: 'block' }}>Línea de Gasto (Categoría)</label>
                                    <select className="squishy-input" value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', marginBottom: 0 }}>
                                        <option value="Logística">Logística (Transporte, Eventos)</option>
                                        <option value="Propaganda">Propaganda (Espectaculares, Digital)</option>
                                        <option value="Nómina">Fuerza Territorial (Nómina/Viáticos)</option>
                                        <option value="Operatividad">Operatividad Administrativa (Casas Amigas)</option>
                                        <option value="Otros">Gastos Generales / Otros</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.3rem', display: 'block' }}>Concepto / Justificación</label>
                            <input type="text" className="squishy-input" placeholder="Detalle la transacción..." value={description} onChange={e => setDescription(e.target.value)} required />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <button type="submit" className="primary-btn" style={{ flex: 2, padding: '0.6rem' }}>REGISTRAR {type === 'ingreso' ? 'INGRESO' : 'GASTO'}</button>
                            <button type="button" onClick={() => setIsCreating(false)} className="squishy-btn mini" style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#EF4444' }}>Cancelar</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Dashboard Graphs & Tables Area */}
            {!isCreating && transactions.length > 0 && (
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    {/* Donut Chart (Left) */}
                    <div style={{ flex: '1 1 350px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 1rem 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'Inter', fontSize: '1rem' }}>
                            <PieChartIcon size={18} color="var(--tertiary)" /> FLUJO DE CAPITAL VORAZ (EGRESOS)
                        </h4>
                        {donutData.length > 0 ? (
                            <div style={{ width: '100%', height: '300px' }}>
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie
                                            data={donutData}
                                            innerRadius={70}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {donutData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || CATEGORY_COLORS['Otros']} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: any) => formatCurrency(Number(value))}
                                            contentStyle={{ backgroundColor: 'rgba(15, 18, 24, 0.95)', border: '1px solid var(--tertiary)', borderRadius: '8px' }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
                                Sin egresos registrados.
                            </div>
                        )}
                    </div>

                    {/* Transaction History Table (Right) */}
                    <div style={{ flex: '2 1 450px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.5rem', overflowX: 'auto' }}>
                        <h4 style={{ margin: '0 0 1rem 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'Inter', fontSize: '1rem' }}>
                            <List size={18} color="var(--tertiary)" /> LIBRO MAYOR (ÚLTIMOS MOVIMIENTOS)
                        </h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8' }}>
                                    <th style={{ padding: '0.8rem 0.5rem' }}>Fecha</th>
                                    <th style={{ padding: '0.8rem 0.5rem' }}>Concepto</th>
                                    <th style={{ padding: '0.8rem 0.5rem' }}>Línea</th>
                                    <th style={{ padding: '0.8rem 0.5rem', textAlign: 'right' }}>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.slice(0, 10).map(t => (
                                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.8rem 0.5rem', color: '#ccc' }}>{t.reference_date}</td>
                                        <td style={{ padding: '0.8rem 0.5rem', color: 'white', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</td>
                                        <td style={{ padding: '0.8rem 0.5rem' }}>
                                            <span style={{
                                                backgroundColor: t.transaction_type === 'ingreso' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)',
                                                color: t.transaction_type === 'ingreso' ? '#10B981' : '#ccc',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem'
                                            }}>
                                                {t.category}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.8rem 0.5rem', textAlign: 'right', fontWeight: 'bold', fontFamily: 'Inter', color: t.transaction_type === 'ingreso' ? '#10B981' : '#EF4444' }}>
                                            {t.transaction_type === 'ingreso' ? '+' : '-'}{formatCurrency(t.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!isCreating && transactions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', marginTop: '1rem' }}>
                    Aún no hay movimientos capitales registrados en el periodo electoral.
                </div>
            )}
        </div>
    );
};
