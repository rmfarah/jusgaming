'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const PARTICLE_COUNT = 60
    const CONNECTION_DISTANCE = 120

    interface Particle {
      x: number
      y: number
      vx: number
      vy: number
      radius: number
    }

    let particles: Particle[] = []
    let animationId: number

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const init = () => {
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 1.5 + Math.random() * 1.5,
      }))
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECTION_DISTANCE) {
            const opacity = (1 - dist / CONNECTION_DISTANCE) * 0.3
            ctx.strokeStyle = `rgba(74, 143, 212, ${opacity})`
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      // Particles
      particles.forEach((p) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(74, 143, 212, 0.6)'
        ctx.fill()

        p.x += p.vx
        p.y += p.vy

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1
      })

      animationId = requestAnimationFrame(draw)
    }

    const handleResize = () => {
      resize()
      init()
    }

    resize()
    init()
    draw()

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div
      style={{ backgroundColor: '#0a1628' }}
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden"
    >
      {/* Animated particle canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      />

      {/* Centered content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl mx-auto">
        {/* Label */}
        <p
          className="text-xs font-semibold tracking-[0.25em] uppercase mb-6"
          style={{ color: '#4a8fd4' }}
        >
          JusGaming
        </p>

        {/* Title */}
        <h1
          className="text-4xl sm:text-5xl leading-tight mb-5"
          style={{
            color: '#e8eef6',
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          O processo começa aqui,{' '}
          <span style={{ color: '#4a8fd4' }}>na sala de aula</span>
        </h1>

        {/* Tagline */}
        <p
          className="text-[15px] leading-relaxed mb-8 max-w-lg"
          style={{ color: '#7a9bbf' }}
        >
          Simulador de processos judiciais e arbitrais para o ensino
          prático de Direito Processual Civil
        </p>

        {/* Pill tags */}
        <div className="flex items-center gap-2 flex-wrap justify-center mb-10">
          {['Processo Civil', 'Arbitragem', 'Prática Jurídica'].map((label) => (
            <span
              key={label}
              className="px-3 py-1 rounded-full text-xs font-medium"
              style={{
                border: '1px solid #1e3a5f',
                color: '#5b8fc9',
                backgroundColor: 'rgba(24, 95, 165, 0.08)',
              }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* CTA button */}
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 font-medium text-sm text-white rounded-lg transition-colors"
          style={{
            backgroundColor: '#185FA5',
            padding: '12px 32px',
            borderRadius: '8px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#0c447c'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#185FA5'
          }}
        >
          Entrar na plataforma
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </div>
  )
}
