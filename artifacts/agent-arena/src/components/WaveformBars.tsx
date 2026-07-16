import { motion } from 'framer-motion';

type WaveformBarsProps = {
  isActive: boolean;
  color: string;
  count?: number;
};

export function WaveformBars({ isActive, color, count = 24 }: WaveformBarsProps) {
  const bars = Array.from({ length: count });

  return (
    <div className="flex items-center gap-1 h-16" data-testid="waveform">
      {bars.map((_, i) => (
        <motion.div
          key={i}
          className="w-1.5 rounded-full"
          style={{ backgroundColor: color }}
          initial={{ height: 4, opacity: 0.3 }}
          animate={{
            height: isActive ? [4, Math.random() * 40 + 10, 4] : 4,
            opacity: isActive ? 1 : 0.3,
          }}
          transition={{
            height: {
              repeat: isActive ? Infinity : 0,
              repeatType: 'reverse',
              duration: isActive ? Math.random() * 0.5 + 0.3 : 0.3,
              delay: isActive ? Math.random() * 0.5 : 0,
              ease: "easeInOut"
            },
            opacity: { duration: 0.3 }
          }}
        />
      ))}
    </div>
  );
}
