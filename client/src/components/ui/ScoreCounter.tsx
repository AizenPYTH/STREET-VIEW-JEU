import { animate, useMotionValue, useTransform, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { playSound } from '../../services/sound';

interface ScoreCounterProps {
  value: number;
  prefix?: string;
  duration?: number;
  delay?: number;
  className?: string;
  sound?: boolean;
}

/** Animated number that counts up to `value`. */
export function ScoreCounter({ value, prefix = '', duration = 1.1, delay = 0, className = '', sound = false }: ScoreCounterProps) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => `${prefix}${Math.round(v).toLocaleString('en-US')}`);
  const lastTick = useRef(0);
  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      delay,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        if (sound && v - lastTick.current > Math.max(40, value / 14)) {
          lastTick.current = v;
          playSound('score');
        }
      },
    });
    return () => controls.stop();
  }, [value, duration, delay, motionValue, sound]);
  return <motion.span className={`tabular ${className}`}>{rounded}</motion.span>;
}
