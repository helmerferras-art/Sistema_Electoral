import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import Tesseract from 'tesseract.js';
import { Camera, X, Loader2, RefreshCw } from 'lucide-react';

interface ExtractedData {
    nombre: string;
    domicilio: string;
    clave_elector: string;
    curp: string;
    seccion: string;
    vigencia: string;
    fecha_nacimiento: string;
    foto?: string;
}

interface ScannerINEProps {
    onScanComplete: (data: ExtractedData) => void;
    onCancel: () => void;
}

export const ScannerINE: React.FC<ScannerINEProps> = ({ onScanComplete, onCancel }) => {
    const webcamRef = useRef<Webcam>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanStatus, setScanStatus] = useState<string>('ESPERANDO CREDENCIAL...');
    const [continuousScanning, setContinuousScanning] = useState(true);

    const videoConstraints = {
        width: 1280,
        height: 720,
        facingMode: "environment"
    };

    const processOCR = async (imageSrc: string): Promise<ExtractedData | null> => {
        try {
            const { data: { text } } = await Tesseract.recognize(imageSrc, 'spa+eng');
            console.log("OCR Match Try:", text);

            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
            const fullText = lines.join(' ').replace(/\s+/g, ' ');

            // Regex más flexible (acepta confundir letras con números similares)
            const claveRegex = /[A-Z0-9]{6}[0-9O]{8}[A-Z0-9]{4}/i;
            const curpRegex = /[A-Z]{4}[0-9O]{6}[HM][A-Z]{5}[A-Z0-9][0-9O]/i;

            const claveMatch = fullText.match(claveRegex);
            const curpMatch = fullText.match(curpRegex);

            const extracted: ExtractedData = {
                nombre: '', domicilio: '', clave_elector: '', curp: '',
                seccion: '', vigencia: '', fecha_nacimiento: '', foto: imageSrc
            };

            if (claveMatch) extracted.clave_elector = claveMatch[0].toUpperCase().replace(/O/g, '0');
            if (curpMatch) extracted.curp = curpMatch[0].toUpperCase().replace(/O/g, '0');

            // Si encontró algo o al menos detectó que es una INE (por la palabra INSTITUTO)
            if (!claveMatch && !curpMatch && !fullText.includes('INSTITUTO')) return null;

            // Extraer lo demás con lógica fuzzy
            const seccionMatch = fullText.match(/(?:SECCION|SECCIÓN|SWOON|SCION|SCON|SEC0|SSOCON|SCCHON|1638|1E3B)\s*(\d{4})/i);
            if (seccionMatch) extracted.seccion = seccionMatch[1];
            else {
                // Si vemos un número de 4 dígitos cerca de 'localidad' o al final
                const digits4 = fullText.match(/\b\d{4}\b/g);
                if (digits4) extracted.seccion = digits4[digits4.length - 1];
            }

            const vigenciaMatch = fullText.match(/(?:VIGENCIA|VIGEN|VAMO|VICEN|VIG|VANO|VGENOA|2027|2O27)\s*(20\d{2})/i);
            if (vigenciaMatch) extracted.vigencia = vigenciaMatch[1];

            const birthMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})/);
            if (birthMatch) extracted.fecha_nacimiento = birthMatch[1];

            // Limpieza de campos personales
            let domIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (/DOMICILIO|DOMIGILO/i.test(lines[i])) { domIndex = i; break; }
            }

            if (domIndex !== -1) {
                const noiseWords = ['INSTITUTO', 'NACIONAL', 'ELECTORAL', 'MEXICO', 'MÉXICO', 'CREDENCIAL', 'PARA', 'VOTAR', 'NOMBRE'];
                const potentialNameLines = lines.slice(Math.max(0, domIndex - 4), domIndex);

                extracted.nombre = potentialNameLines
                    .map(line => line.split(' ').filter(word => !noiseWords.includes(word.toUpperCase())).join(' '))
                    .filter(line => line.length > 2 && !/\d/.test(line))
                    .join(' ')
                    .replace(/[^a-zA-ZÁÉÍÓÚáéíóúÑñ\s]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                const rawDom = lines.slice(domIndex + 1, domIndex + 4).join(', ').trim();
                extracted.domicilio = rawDom.replace(/^\d{2}\/\d{2}\/\d{4}[:\s\-]*/, '').trim();
            }

            return extracted;
        } catch (e) {
            console.error(e);
            return null;
        }
    };

    const triggerCapture = useCallback(async (isManual = false) => {
        if (!isManual && (!continuousScanning || isScanning)) return;

        const video = webcamRef.current?.video;
        if (!video || video.videoWidth === 0) return;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Binarización
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            const finalVal = avg > 110 ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = finalVal;
        }
        ctx.putImageData(imageData, 0, 0);

        const processedImage = canvas.toDataURL('image/jpeg', 0.8);
        const originalImage = webcamRef.current?.getScreenshot() || processedImage;

        setIsScanning(true);
        setScanStatus(isManual ? 'FORZANDO CAPTURA...' : 'CAPTURANDO...');

        const result = await processOCR(processedImage);

        if (result && (result.clave_elector || result.curp || isManual)) {
            // Si es manual, nos quedamos con lo que haya salido aunque falten campos
            if (isManual) result!.foto = originalImage;

            setContinuousScanning(false);
            setScanStatus('¡COMPLETADO!');
            setTimeout(() => {
                onScanComplete(result || { nombre: '', domicilio: '', clave_elector: '', curp: '', seccion: '', vigencia: '', fecha_nacimiento: '', foto: originalImage });
                setIsScanning(false);
            }, 800);
        } else {
            setIsScanning(false);
            setScanStatus('INTENTA ACERCAR UN POCO MÁS...');
        }
    }, [continuousScanning, isScanning, onScanComplete]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (continuousScanning && !isScanning) {
                triggerCapture(false);
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [continuousScanning, isScanning, triggerCapture]);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15,18,24,0.98)', zIndex: 9999,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(10px)'
        }}>

            <div style={{ position: 'relative', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem' }}>
                <button
                    onClick={onCancel}
                    style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', zIndex: 10, cursor: 'pointer', borderRadius: '50%', padding: '8px' }}
                >
                    <X size={28} />
                </button>

                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontFamily: 'Oswald, sans-serif', color: 'var(--primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontSize: '1.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Camera /> ESCÁNER INE v4.0
                    </h2>
                    <p style={{ color: 'var(--tertiary)', fontSize: '0.9rem', marginTop: '0.8rem', fontWeight: 'bold' }}>
                        MODO AUTO/MANUAL ACTIVO
                    </p>
                </div>

                <div style={{
                    position: 'relative', width: '100%', borderRadius: '24px', overflow: 'hidden',
                    border: '3px solid var(--primary)', boxShadow: '0 0 40px rgba(255,90,54,0.3)',
                    background: '#000'
                }}>
                    <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        videoConstraints={videoConstraints}
                        style={{ width: '100%', display: 'block' }}
                        screenshotQuality={1}
                    />

                    <div style={{
                        position: 'absolute', top: '15%', left: '8%', right: '8%', bottom: '15%',
                        border: '2px solid rgba(255, 90, 54, 0.4)',
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
                        pointerEvents: 'none',
                        borderRadius: '12px'
                    }}>
                        <div style={{
                            width: '100%', height: '2px',
                            background: 'var(--primary)',
                            position: 'absolute', top: '0',
                            boxShadow: '0 0 15px var(--primary)',
                            animation: 'scan-line 3s linear infinite'
                        }}></div>
                    </div>
                </div>

                <div className="flex-center flex-col" style={{ marginTop: '2rem', color: isScanning ? 'var(--primary)' : 'var(--tertiary)' }}>
                    {isScanning ? (
                        <Loader2 className="spin" size={40} />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', alignItems: 'center' }}>
                            <div style={{ fontFamily: 'Oswald, sans-serif', letterSpacing: '0.15em', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center' }}>
                                {scanStatus}
                            </div>

                            {/* Botón de respaldo manual */}
                            <button
                                onClick={() => triggerCapture(true)}
                                className="squishy-btn primary"
                                style={{
                                    padding: '0.8rem 2rem',
                                    fontSize: '1rem',
                                    borderRadius: '30px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    background: 'linear-gradient(45deg, var(--primary), var(--secondary))'
                                }}
                            >
                                <RefreshCw size={18} /> CAPTURAR YA (MANUAL)
                            </button>

                            <p style={{ color: '#64748B', fontSize: '0.7rem', textAlign: 'center' }}>
                                Si el automático no detecta, presiona el botón naranja.<br />
                                Asegúrate de que los códigos se vean claros.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            <style>{`
                @keyframes scan-line {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>
        </div>
    );
};
