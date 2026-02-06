"use client";

import { useScroll, useMotionValueEvent, motion, useTransform } from "framer-motion";
import { useRef, useEffect, useState, useMemo } from "react";

const FRAME_COUNT = 480;

export default function ChipScroll() {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [images, setImages] = useState<HTMLImageElement[]>([]);
    const [loaded, setLoaded] = useState(false);

    // Scroll mapping: 0 to 1 -> 0 to FRAME_COUNT - 1
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"],
    });

    const currentFrame = useTransform(scrollYProgress, [0, 1], [0, FRAME_COUNT - 1]);

    useEffect(() => {
        const loadImages = async () => {
            // 1. Load first frame immediately to unblock render
            const firstImg = new Image();
            firstImg.src = "/sequence/ezgif-frame-001.png";
            await new Promise((resolve) => {
                firstImg.onload = resolve;
                firstImg.onerror = resolve;
            });

            // Show first frame immediately
            setImages([firstImg]);
            setLoaded(true);

            // 2. Load the rest in background (parallel)
            const remainingImagesProms = [];
            for (let i = 2; i <= FRAME_COUNT; i++) {
                const img = new Image();
                let src = "";
                if (i <= 240) {
                    const frameNumber = i.toString().padStart(3, "0");
                    src = `/sequence/ezgif-frame-${frameNumber}.png`;
                } else {
                    const frameNumber = (481 - i).toString().padStart(3, "0");
                    src = `/photo/ezgif-frame-${frameNumber}.png`;
                }
                img.src = src;
                const p = new Promise<HTMLImageElement>((resolve) => {
                    img.onload = () => resolve(img);
                    img.onerror = () => resolve(img);
                });
                remainingImagesProms.push(p);
            }

            const restImages = await Promise.all(remainingImagesProms);
            setImages([firstImg, ...restImages]);
        };

        loadImages();
    }, []);

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                if (loaded) renderFrame(currentFrame.get());
            }
        };
        handleResize(); // Initial size
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [loaded, currentFrame]);

    const renderFrame = (index: number) => {
        const canvas = canvasRef.current;
        if (!canvas || images.length === 0) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const img = images[Math.min(FRAME_COUNT - 1, Math.max(0, Math.floor(index)))];
        if (!img || !img.width) return; // Prevent drawing if image not loaded or broken

        // Calculate scale to cover/contain as needed (contain here)
        const scale = Math.max(
            canvas.width / img.width,
            canvas.height / img.height
        );
        const x = (canvas.width / 2) - (img.width / 2) * scale;
        const y = (canvas.height / 2) - (img.height / 2) * scale;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
    };

    // Render on scroll update
    useMotionValueEvent(currentFrame, "change", (latest) => {
        if (loaded) renderFrame(latest);
    });

    // Initial render when loaded
    useEffect(() => {
        if (loaded) {
            renderFrame(currentFrame.get());
        }
    }, [loaded]);



    return (
        <div ref={containerRef} className="relative h-[800vh] bg-black">
            <div className="fixed top-0 left-0 h-screen w-full overflow-hidden z-0">
                <canvas ref={canvasRef} className="block w-full h-full" />
            </div>

            {/* Story Overlays removed as per user request */}
        </div>
    );
}


