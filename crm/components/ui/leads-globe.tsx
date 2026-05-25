// @ts-nocheck
"use client"

import { useEffect, useRef, useCallback } from "react"
import createGlobe from "cobe"

export function LeadsGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null)
  const dragOffset = useRef({ phi: 0, theta: 0 })
  const phiOffsetRef = useRef(0)
  const thetaOffsetRef = useRef(0)
  const isPausedRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY }
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing"
    isPausedRef.current = true
  }, [])

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi
      thetaOffsetRef.current += dragOffset.current.theta
      dragOffset.current = { phi: 0, theta: 0 }
    }
    pointerInteracting.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = "grab"
    isPausedRef.current = false
  }, [])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi: (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        }
      }
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("pointerup", handlePointerUp, { passive: true })
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [handlePointerUp])

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    let globe: ReturnType<typeof createGlobe> | null = null
    let animationId: number
    let phi = 0

    function init() {
      const width = canvas.offsetWidth
      if (width === 0 || globe) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: width * dpr,
        height: width * dpr,
        phi: 0,
        theta: 0.2,
        dark: 0,
        diffuse: 1.2,
        mapSamples: 24000,
        mapBrightness: 4,
        baseColor: [1, 1, 1],
        markerColor: [1, 0.59, 0.31],
        glowColor: [1, 1, 1],
        markers: [
          { location: [40.7, -74.0], size: 0.06 },
          { location: [34.05, -118.24], size: 0.06 },
          { location: [41.88, -87.63], size: 0.06 },
          { location: [29.76, -95.37], size: 0.06 },
          { location: [33.45, -112.07], size: 0.06 },
          { location: [47.61, -122.33], size: 0.06 },
        ],
        onRender: (state) => {
          if (!isPausedRef.current) phi += 0.003
          state.phi = phi + phiOffsetRef.current + dragOffset.current.phi
          state.theta = 0.2 + thetaOffsetRef.current + dragOffset.current.theta
        },
      })

      setTimeout(() => {
        if (canvas) canvas.style.opacity = "1"
      }, 100)
    }

    if (canvas.offsetWidth > 0) {
      init()
    } else {
      const ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
          ro.disconnect()
          init()
        }
      })
      ro.observe(canvas)
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (globe) globe.destroy()
    }
  }, [])

  return (
    <div className={`relative aspect-square select-none ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          opacity: 0,
          transition: "opacity 1.2s ease",
          borderRadius: "50%",
          touchAction: "none",
          contain: "layout paint size",
        }}
      />

      <div className="absolute top-[10%] left-[6%]">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          Hot Lead
        </span>
      </div>
      <div className="absolute top-[20%] right-[4%]">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Pre-approved
        </span>
      </div>
      <div className="absolute top-[42%] left-[0%]">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          New Renter
        </span>
      </div>
      <div className="absolute bottom-[24%] right-[2%]">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Tour Booked
        </span>
      </div>
      <div className="absolute bottom-[10%] left-[12%]">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
          Buyer Lead
        </span>
      </div>
      <div className="absolute top-[55%] right-[8%]">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          Warm Lead
        </span>
      </div>
    </div>
  )
}
