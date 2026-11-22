import { Component, type ReactNode } from 'react';

/**
 * Si una pantalla falla, se muestra un aviso con botón para recargar en lugar de dejar la app en blanco.
 * Lo más común: el teléfono tenía abierta una versión anterior y ya se publicó una nueva.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error: unknown) { console.error('[Tlatoani] Error de pantalla:', error); }
    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', padding: '1.5rem', textAlign: 'center', color: '#e2e8f0' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Algo no cargó bien</div>
                <div style={{ fontSize: '0.9rem', color: '#94A3B8', maxWidth: 360 }}>Puede que haya una versión nueva de Tlatoani. Recarga para continuar; lo que tenías guardado sin señal no se pierde.</div>
                <button className="squishy-btn primary" style={{ padding: '0.7rem 1.4rem' }} onClick={() => window.location.reload()}>Recargar</button>
            </div>
        );
    }
}
export default ErrorBoundary;
