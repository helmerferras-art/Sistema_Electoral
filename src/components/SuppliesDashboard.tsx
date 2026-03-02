import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PackageSearch, Send, Clock, Plus, Users } from 'lucide-react';

export default function SuppliesDashboard() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'inventory' | 'dispatch'>('inventory');

    // Inventory State
    const [resources, setResources] = useState<any[]>([]);
    const [newResource, setNewResource] = useState({ name: '', type: 'lonas', quantity: 1, total_cost: 0 });
    const [isAddingResource, setIsAddingResource] = useState(false);

    // Dispatch State
    const [assignments, setAssignments] = useState<any[]>([]);
    const [tenantUsers, setTenantUsers] = useState<any[]>([]);
    const [dispatchForm, setDispatchForm] = useState({ resource_id: '', assigned_to: '', quantity: 1 });
    const [isDispatching, setIsDispatching] = useState(false);

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user || !user.tenant_id) return;
        fetchData();
    }, [user]);

    const isMasterLogistics = ['superadmin', 'candidato', 'coordinador_logistica'].includes(user?.role || '');

    const fetchData = async () => {
        if (!user?.tenant_id) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            if (isMasterLogistics) {
                // Fetch Master Resources
                const { data: resData } = await supabase
                    .from('resources')
                    .select('*')
                    .eq('tenant_id', user?.tenant_id)
                    .order('created_at', { ascending: false });
                if (resData) setResources(resData);
            } else {
                // Fetch Sub-Inventory for Coordinator
                const { data: received } = await supabase
                    .from('resource_assignments')
                    .select('resources(id, name, type, total_cost)')
                    .eq('assigned_to', user?.id)
                    .eq('tenant_id', user?.tenant_id);

                const { data: dispatched } = await supabase
                    .from('resource_assignments')
                    .select('quantity, resource_id')
                    .eq('assigned_by', user?.id)
                    .eq('tenant_id', user?.tenant_id);

                // Calculate balances
                const inventoryMap = new Map();

                received?.forEach((item: any) => {
                    const res: any = Array.isArray(item.resources) ? item.resources[0] : item.resources;
                    if (!res) return;

                    const resId = res.id;
                    if (!inventoryMap.has(resId)) {
                        inventoryMap.set(resId, {
                            id: resId,
                            name: res.name,
                            type: res.type,
                            total_cost: res.total_cost,
                            quantity: 0
                        });
                    }
                    inventoryMap.get(resId).quantity += 1; // Default to 1 as column missing
                });

                dispatched?.forEach((item: any) => {
                    const resId = item.resource_id;
                    if (inventoryMap.has(resId)) {
                        inventoryMap.get(resId).quantity -= 1; // Default to 1 as column missing
                    }
                });

                // Filter out items with 0 stock
                const availableResources = Array.from(inventoryMap.values()).filter((r: any) => r.quantity > 0);
                setResources(availableResources);
            }

            // Fetch Assignments History
            let query = supabase
                .from('resource_assignments')
                .select(`
                    id, assigned_date, return_date, is_loot, assigned_by,
                    resources(name, type),
                    assignee:users!resource_assignments_assigned_to_fkey(name, phone, role)
                `)
                .eq('tenant_id', user?.tenant_id)
                .order('assigned_date', { ascending: false });

            if (!isMasterLogistics) {
                // Sub-coordinators only see what they dispatched
                query = query.eq('assigned_by', user?.id);
            }

            const { data: assignData } = await query;
            if (assignData) setAssignments(assignData);

            // Fetch eligible users to assign to
            const eligibleRoles = isMasterLogistics ? ['coordinador', 'lider'] : ['lider', 'brigadista'];
            const { data: usersData } = await supabase
                .from('users')
                .select('id, name, role')
                .eq('tenant_id', user?.tenant_id)
                .in('role', eligibleRoles)
                .order('name');
            if (usersData) setTenantUsers(usersData);

        } catch (error) {
            console.error("Error fetching supplies data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddResource = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsAddingResource(true);
        try {
            const { error } = await supabase.from('resources').insert([{
                tenant_id: user?.tenant_id,
                name: newResource.name,
                type: newResource.type,
                quantity: newResource.quantity,
                total_cost: newResource.total_cost
            }]);

            if (error) throw error;
            setNewResource({ name: '', type: 'lonas', quantity: 1, total_cost: 0 });
            await fetchData();
        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsAddingResource(false);
        }
    };

    const handleDispatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!dispatchForm.resource_id || !dispatchForm.assigned_to) {
            alert("Selecciona un recurso y un usuario destinatario");
            return;
        }
        setIsDispatching(true);
        try {
            const { error } = await supabase.from('resource_assignments').insert([{
                tenant_id: user?.tenant_id,
                resource_id: dispatchForm.resource_id,
                assigned_to: dispatchForm.assigned_to,
                assigned_by: user?.id,
                quantity: dispatchForm.quantity
            }]);

            if (error) throw error;
            setDispatchForm({ resource_id: '', assigned_to: '', quantity: 1 });
            await fetchData();
            alert("Recurso despachado exitosamente");
        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsDispatching(false);
        }
    };

    return (
        <div className="animate-fade-in" style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto', color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <PackageSearch size={32} color="#00D4FF" />
                <div>
                    <h2 style={{ margin: 0, fontFamily: 'Oswald', fontSize: '2rem', letterSpacing: '0.05em' }}>MÓDULO DE SUMINISTROS</h2>
                    <p style={{ margin: 0, color: '#aaa', fontSize: '0.9rem' }}>Control Logístico y Asignación de Recursos Gubernamentales/Electorales</p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                <button
                    onClick={() => setActiveTab('inventory')}
                    style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: activeTab === 'inventory' ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                        color: activeTab === 'inventory' ? '#00D4FF' : '#888',
                        border: `1px solid ${activeTab === 'inventory' ? '#00D4FF' : 'transparent'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s'
                    }}
                >
                    <PackageSearch size={18} /> {isMasterLogistics ? 'INVENTARIO MAESTRO' : 'MI INVENTARIO'}
                </button>
                <button
                    onClick={() => setActiveTab('dispatch')}
                    style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: activeTab === 'dispatch' ? 'rgba(255, 51, 102, 0.1)' : 'transparent',
                        color: activeTab === 'dispatch' ? '#FF3366' : '#888',
                        border: `1px solid ${activeTab === 'dispatch' ? '#FF3366' : 'transparent'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s'
                    }}
                >
                    <Send size={18} /> ESTACIÓN DE DESPACHO
                </button>
            </div>

            {!user?.tenant_id && !loading && (
                <div style={{ textAlign: 'center', padding: '4rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Plus size={48} color="#FF3366" style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <h3 style={{ color: '#FF3366', fontFamily: 'Oswald' }}>SIN CAMPAÑA ASIGNADA</h3>
                    <p style={{ maxWidth: '500px', margin: '0 auto', color: '#64748B' }}>
                        Para gestionar inventarios necesitas estar vinculado a una campaña.
                        Si eres superadmin, selecciona un cliente desde el panel de control.
                    </p>
                </div>
            )}

            {user?.tenant_id && !loading && (
                <>
                    {/* INVENTORY TAB */}
                    {activeTab === 'inventory' && (
                        <div style={{ display: 'grid', gridTemplateColumns: isMasterLogistics ? '1fr 2fr' : '1fr', gap: '2rem' }}>
                            {/* Add Resource Form (Only Master) */}
                            {isMasterLogistics && (
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', height: 'fit-content' }}>
                                    <h3 style={{ marginTop: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Plus size={18} color="#00D4FF" /> Registrar Nuevo Lote
                                    </h3>
                                    <form onSubmit={handleAddResource} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.3rem' }}>Nombre / Descripción</label>
                                            <input
                                                type="text"
                                                required
                                                value={newResource.name}
                                                onChange={e => setNewResource({ ...newResource, name: e.target.value })}
                                                placeholder="Lonas 2x2 Candidato..."
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.3rem' }}>Categoría de Suministro</label>
                                            <select
                                                value={newResource.type}
                                                onChange={e => setNewResource({ ...newResource, type: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                                            >
                                                <option value="playeras">Playeras / Gorras (Textil)</option>
                                                <option value="lonas">Lonas / Propaganda</option>
                                                <option value="vehiculo">Vehículo Asignado</option>
                                                <option value="gasolina">Vales de Gasolina</option>
                                                <option value="espacio">Espacio / Local</option>
                                                <option value="recompensa_loot">Recompensa o Loot Especial</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.3rem' }}>Cantidad / Piezas</label>
                                            <input
                                                type="number"
                                                min="1"
                                                required
                                                value={newResource.quantity}
                                                onChange={e => setNewResource({ ...newResource, quantity: parseInt(e.target.value) || 1 })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.3rem' }}>Costo Total Aproximado (Opcional)</label>
                                            <input
                                                type="number"
                                                value={newResource.total_cost || ''}
                                                onChange={e => setNewResource({ ...newResource, total_cost: parseFloat(e.target.value) || 0 })}
                                                placeholder="$0.00"
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={isAddingResource}
                                            style={{
                                                padding: '0.8rem',
                                                backgroundColor: '#00D4FF',
                                                color: 'black',
                                                border: 'none',
                                                borderRadius: '6px',
                                                fontWeight: 'bold',
                                                cursor: isAddingResource ? 'not-allowed' : 'pointer',
                                                marginTop: '0.5rem'
                                            }}
                                        >
                                            {isAddingResource ? 'Registrando...' : 'Ingresar al Almacén'}
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* Resources List */}
                            <div>
                                <h3 style={{ marginTop: 0, paddingBottom: '0.5rem', color: '#00D4FF', fontFamily: 'Oswald' }}>
                                    {isMasterLogistics ? 'CATÁLOGO DE ACTIVOS DISPONIBLES' : 'RECURSOS A MI CARGO'}
                                </h3>
                                {resources.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', color: '#888' }}>
                                        No hay suministros registrados en la base de datos.
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                                        {resources.map(res => (
                                            <div key={res.id} style={{ backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '1rem' }}>
                                                <div style={{ fontSize: '0.7rem', color: '#00D4FF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{res.type}</div>
                                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.5rem' }}>{res.name}</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: '#888' }}>
                                                    <span>Stock: <strong style={{ color: 'white' }}>{res.quantity || 1} uds.</strong></span>
                                                    <span>ID: {res.id.split('-')[0]}</span>
                                                </div>
                                                {res.total_cost > 0 && <div style={{ marginTop: '0.5rem', color: '#10B981', fontWeight: 'bold', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem' }}>Valor: ${res.total_cost.toLocaleString()}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* DISPATCH TAB */}
                    {activeTab === 'dispatch' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                            {/* Dispatch Form */}
                            <div style={{ backgroundColor: 'rgba(255, 51, 102, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255, 51, 102, 0.2)', height: 'fit-content' }}>
                                <h3 style={{ marginTop: 0, borderBottom: '1px solid rgba(255, 51, 102, 0.2)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#FF3366' }}>
                                    <Send size={18} /> Asignar Suministro
                                </h3>
                                <form onSubmit={handleDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.3rem' }}>Seleccionar Suministro (Origen)</label>
                                        <select
                                            required
                                            value={dispatchForm.resource_id}
                                            onChange={e => setDispatchForm({ ...dispatchForm, resource_id: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255, 51, 102, 0.2)', color: 'white' }}
                                        >
                                            <option value="">-- Elige un recurso del catálogo --</option>
                                            {resources.map(res => (
                                                <option key={res.id} value={res.id}>[{res.type.toUpperCase()}] {res.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.3rem' }}>Destinatario (Oficial en Campo)</label>
                                        <select
                                            required
                                            value={dispatchForm.assigned_to}
                                            onChange={e => setDispatchForm({ ...dispatchForm, assigned_to: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255, 51, 102, 0.2)', color: 'white' }}
                                        >
                                            <option value="">-- Oficial Destinatario --</option>
                                            {tenantUsers.map(u => (
                                                <option key={u.id} value={u.id}>[{u.role.toUpperCase()}] {u.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.3rem' }}>Cantidad a Despachar</label>
                                        <input
                                            type="number"
                                            min="1"
                                            required
                                            value={dispatchForm.quantity}
                                            onChange={e => setDispatchForm({ ...dispatchForm, quantity: parseInt(e.target.value) || 1 })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255, 51, 102, 0.2)', color: 'white' }}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isDispatching}
                                        style={{
                                            padding: '0.8rem',
                                            backgroundColor: '#FF3366',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '6px',
                                            fontWeight: 'bold',
                                            cursor: isDispatching ? 'not-allowed' : 'pointer',
                                            marginTop: '0.5rem'
                                        }}
                                    >
                                        {isDispatching ? 'Despachando...' : 'Autorizar y Despachar'}
                                    </button>
                                </form>
                            </div>

                            {/* Active Deployments */}
                            <div>
                                <h3 style={{ marginTop: 0, paddingBottom: '0.5rem', color: '#FF3366', fontFamily: 'Oswald' }}>HISTORIAL DE DESPLIEGUES TÁCTICOS</h3>
                                {assignments.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', color: '#888' }}>
                                        No se han despachado suministros aún.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                        {assignments.map(assign => (
                                            <div key={assign.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <div style={{ backgroundColor: 'rgba(255, 51, 102, 0.1)', padding: '0.8rem', borderRadius: '8px' }}>
                                                        <PackageSearch size={24} color="#FF3366" />
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{assign.quantity || 1}x {assign.resources?.name || 'Recurso Desconocido'}</div>
                                                        <div style={{ fontSize: '0.85rem', color: '#888', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '4px' }}>
                                                            <Users size={12} /> Asignado a: <span style={{ color: '#00D4FF' }}>{assign.assignee?.name} ({assign.assignee?.role})</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    {/* In a real app we'd fetch resource_logs to check if it's verified. For MVP, we'll just show dispatch date */}
                                                    <div style={{ fontSize: '0.8rem', color: '#888', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                                                        <Clock size={12} /> Despachado:
                                                    </div>
                                                    <div style={{ fontSize: '0.9rem', color: 'white' }}>
                                                        {new Date(assign.assigned_date).toLocaleDateString()}
                                                    </div>
                                                    {assign.is_loot && <div style={{ fontSize: '0.7rem', color: '#F59E0B', marginTop: '4px', border: '1px solid #F59E0B', padding: '2px 4px', borderRadius: '4px', display: 'inline-block' }}>ESPECIAL (LOOT)</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {loading && user?.tenant_id && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#888', fontFamily: 'Oswald' }}>
                    <div className="flex-center" style={{ gap: '1rem' }}>
                        <Clock className="animate-spin" size={20} />
                        CARGANDO DATOS LOGÍSTICOS...
                    </div>
                </div>
            )}
        </div>
    );
}
