"use client";

import { useScroll, useMotionValueEvent, useTransform } from "framer-motion";
import { useRef, useEffect, useState } from "react";

// --- Configuration Types & Constants ---

type DeviceConfig = {
    type: 'desktop' | 'tablet' | 'mobile';
    frameCount: number;
    pathPrefix: string;
    canvasScale: number;
    lazyLoadBatch: number;
};

// Original desktop configuration (PRESERVED EXACTLY)
const DESKTOP_CONFIG: DeviceConfig = {
    type: 'desktop',
    frameCount: 480,
    pathPrefix: '', // Uses root /sequence and /photo logic
    canvasScale: 1,
    lazyLoadBatch: 50
};

const TABLET_CONFIG: DeviceConfig = {
    type: 'tablet',
    frameCount: 150,
    pathPrefix: '/frames/tablet',
    canvasScale: 0.8,
    lazyLoadBatch: 30
};

const MOBILE_CONFIG: DeviceConfig = {
    type: 'mobile',
    frameCount: 80,
    pathPrefix: '/frames/mobile',
    canvasScale: 0.6,
    lazyLoadBatch: 15
};

export default function ChipScroll() {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [images, setImages] = useState<HTMLImageElement[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [config, setConfig] = useState<DeviceConfig>(DESKTOP_CONFIG);
    const [isLowPower, setIsLowPower] = useState(false);

    // --- 1. Device Detection ---
    useEffect(() => {
        // Simple low-power check
        if (typeof navigator !== 'undefined' && (navigator as any).deviceMemory && (navigator as any).deviceMemory < 4) {
            setIsLowPower(true);
            return;
        }

        const width = window.innerWidth;
        if (width < 768) {
            setConfig(MOBILE_CONFIG);
            // console.log("Mobile Config Active"); 
        } else if (width < 1024) {
            setConfig(TABLET_CONFIG);
            // console.log("Tablet Config Active");
        } else {
            setConfig(DESKTOP_CONFIG);
            // console.log("Desktop Config Active");
        }
    }, []);

    // --- 2. Scroll Mapping ---
    // We Map 0-1 globally, then multiply by config.frameCount in render
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"],
    });

    // --- 3. Image Loading Logic ---
    useEffect(() => {
        if (isLowPower) return;

        const loadImages = async () => {
            // Generate path based on config
            const getLegacyPath = (i: number) => {
                if (i <= 240) {
                    return `/sequence/ezgif-frame-${i.toString().padStart(3, "0")}.png`;
                } else {
                    return `/photo/ezgif-frame-${(481 - i).toString().padStart(3, "0")}.png`;
                }
            };

            const getPath = (i: number) => {
                if (config.type === 'desktop') return getLegacyPath(i);
                return `${config.pathPrefix}/frame-${i.toString().padStart(3, "0")}.png`;
            };

            // 1. Preload Initial Batch
            const initialBatchEnv: HTMLImageElement[] = [];
            const initialCount = Math.min(config.frameCount, 15);

            for (let i = 1; i <= initialCount; i++) {
                const img = new Image();
                img.src = getPath(i);
                await new Promise<void>((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => {
                        // Fallback: If optimized asset missing, load desktop asset
                        if (config.type !== 'desktop') {
                            const desktopIdx = Math.max(1, Math.floor((i / config.frameCount) * DESKTOP_CONFIG.frameCount));
                            img.src = getLegacyPath(desktopIdx);
                        }
                        resolve();
                    };
                });
                initialBatchEnv.push(img);
            }

            setImages(initialBatchEnv);
            setLoaded(true);

            // 2. Lazy Load the rest
            const remainingImages: Promise<HTMLImageElement>[] = [];
            for (let i = initialCount + 1; i <= config.frameCount; i++) {
                const img = new Image();
                img.src = getPath(i);
                // We wrap in promise to handle error/fallback
                const p = new Promise<HTMLImageElement>((resolve) => {
                    img.onload = () => resolve(img);
                    img.onerror = () => {
                        if (config.type !== 'desktop') {
                            const desktopIdx = Math.max(1, Math.floor((i / config.frameCount) * DESKTOP_CONFIG.frameCount));
                            img.src = getLegacyPath(desktopIdx);
                        }
                        resolve(img);
                    };
                });
                remainingImages.push(p);
            }

            // Wait for all to settle
            const resolvedRest = await Promise.all(remainingImages);
            setImages(prev => [...prev, ...resolvedRest]);
        };

        loadImages();
    }, [config, isLowPower]);


    // --- 4. Render Logic (Optimized) ---
    const renderFrame = (progress: number) => {
        const canvas = canvasRef.current;
        if (!canvas || images.length === 0) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Map progress (0-1) to Frame Index
        const frameIndex = Math.min(
            images.length - 1, // Don't exceed loaded images
            Math.max(0, Math.floor(progress * (config.frameCount - 1)))
        );

        const img = images[frameIndex];
        if (!img || !img.width) return;

        // Apply Config Scale
        // We set canvas internal resolution lower on mobile for performance
        // But CSS forces it to cover screen.

        // This scaling logic needs to match the resize listener
        // The render logic assumes canvas.width/height is ALREADY set by resize listener

        const scale = Math.max(
            canvas.width / img.width,
            canvas.height / img.height
        );

        // Center the image
        const x = (canvas.width / 2) - (img.width / 2) * scale;
        const y = (canvas.height / 2) - (img.height / 2) * scale;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
    };

    // --- 5. Resize Handler ---
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                // Apply Scale Factor to internal resolution
                canvas.width = window.innerWidth * config.canvasScale;
                canvas.height = window.innerHeight * config.canvasScale;

                // Force re-render of current frame
                if (loaded) renderFrame(scrollYProgress.get());
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [config.canvasScale, loaded, scrollYProgress]); // Re-run if config changes

    // --- 6. Scroll Loop ---
    useMotionValueEvent(scrollYProgress, "change", (latest) => {
        if (loaded && !isLowPower) {
            requestAnimationFrame(() => renderFrame(latest));
        }
    });

    // Initial Render
    useEffect(() => {
        if (loaded && !isLowPower) {
            renderFrame(scrollYProgress.get());
        }
    }, [loaded, isLowPower]);


    if (isLowPower) {
        return (
            <div className="h-screen w-full bg-black flex items-center justify-center text-white">
                {/* Fallback Static Hero */}
                <img src="/sequence/ezgif-frame-001.png" alt="Hero" className="object-cover w-full h-full opacity-50" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <h1 className="text-4xl font-bold">NeuralCore X1</h1>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative h-[800vh] bg-black">
            <div className="fixed top-0 left-0 h-screen w-full overflow-hidden z-0">
                {/* Canvas scales via CSS to fill screen, but internal resolution is controlled by JS */}
                <canvas ref={canvasRef} className="block w-full h-full" />
            </div>
        </div>
    );
}
