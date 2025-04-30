const blobVariants = {
  idle: {
    scale: [1, 1.05, 1],
    rotate: [0, 5, -5, 0],
    filter: "hue-rotate(0deg) brightness(1)",
    transition: {
      duration: 4,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "reverse"
    }
  },
  listening: {
    scale: [1, 1.1, 1],
    rotate: [0, 3, -3, 0],
    filter: "hue-rotate(45deg) brightness(1.1)",
    transition: {
      duration: 2,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "mirror"
    }
  },
  responding: {
    scale: [1, 1.15, 1],
    rotate: [0, -3, 3, 0],
    filter: "hue-rotate(-45deg) brightness(1.2)",
    transition: {
      duration: 3,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "mirror"
    }
  }
};

const Blob: React.FC<BlobProps> = ({ state = 'idle' }) => {
  return (
    <div className="relative w-full h-full">
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-purple-500/60 to-pink-500/60 rounded-full blur-2xl"
        initial="idle"
        animate={state}
        variants={blobVariants}
      />
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-purple-400/40 to-pink-400/40 rounded-full blur-xl"
        initial="idle"
        animate={state}
        variants={blobVariants}
        style={{ animationDelay: "0.2s" }}
      />
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-purple-300/30 to-pink-300/30 rounded-full blur-lg"
        initial="idle"
        animate={state}
        variants={blobVariants}
        style={{ animationDelay: "0.4s" }}
      />
    </div>
  );
}; 