export { }; // Asegura que este archivo es tratado como un módulo

declare global {
    interface Window {
        c4iNative?: {
            ping: () => Promise<string>;
            getSystemInfo: () => Promise<{ hostname: string, platform: string, arch: string }>;
        };
    }
}
