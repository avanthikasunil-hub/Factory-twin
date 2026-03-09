import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, Factory, Zap } from 'lucide-react';
import { AnimatedBackground } from '@/components/ui/AnimatedBackground';
import { useLineStore } from '@/store/useLineStore';

/**
 * Line Planner Module Home Page
 */
const PlanHomePage = () => {
  const navigate = useNavigate();
  const { savedLines } = useLineStore();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        damping: 20,
        stiffness: 100,
      },
    },
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <AnimatedBackground />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.2 }}
            className="inline-flex items-center gap-3 mb-6"
          >
            <div className="p-3 rounded-2xl bg-gradient-to-br from-primary to-accent industrial-glow">
              <Factory className="w-10 h-10 text-primary-foreground" />
            </div>
          </motion.div>

          <h1 className="text-5xl md:text-6xl font-bold mb-4">
            <span className="text-gradient">Factory Twin</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-lg mx-auto">
            Visualize and plan your garment production lines with powerful 3D layouts
          </p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground"
          >
            <Zap className="w-4 h-4 text-industrial-accent" />
            <span>Powered by advanced OB parsing technology</span>
          </motion.div>
        </motion.div>

        {/* Navigation Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid md:grid-cols-2 gap-6 max-w-4xl w-full"
        >
          {/* Create New Line Card */}
          <motion.div
            variants={itemVariants}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/line-planner/create')}
            className="group cursor-pointer"
          >
            <div className="relative glass-card rounded-2xl p-8 h-64 overflow-hidden">

              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />

              <motion.div
                className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />

              <div className="relative z-10 h-full flex flex-col">
                <div className="p-4 rounded-xl bg-primary/10 w-fit group-hover:bg-primary/20 transition-colors">
                  <Plus className="w-8 h-8 text-primary" />
                </div>

                <div className="mt-auto">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Create New Line</h2>
                  <p className="text-muted-foreground">
                    Upload an OB sheet and generate a 3D sewing line layout
                  </p>
                </div>

                <motion.div
                  className="absolute bottom-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </motion.div>
              </div>
            </div>
          </motion.div>

          {/* View Saved Lines Card */}
          <motion.div
            variants={itemVariants}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/line-planner/lines')}
            className="group cursor-pointer"
          >
            <div className="relative glass-card rounded-2xl p-8 h-64 overflow-hidden">

              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-accent/10 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />

              <motion.div
                className="absolute -top-20 -right-20 w-40 h-40 bg-accent/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />

              <div className="relative z-10 h-full flex flex-col">
                <div className="flex items-center gap-3">
                  <div className="p-4 rounded-xl bg-accent/10 w-fit group-hover:bg-accent/20 transition-colors">
                    <FolderOpen className="w-8 h-8 text-accent" />
                  </div>

                  {savedLines.length > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="px-3 py-1 rounded-full bg-accent/20 text-accent text-sm font-medium"
                    >
                      {savedLines.length} saved
                    </motion.span>
                  )}
                </div>

                <div className="mt-auto">
                  <h2 className="text-2xl font-bold text-foreground mb-2">View Saved Lines</h2>
                  <p className="text-muted-foreground">
                    Browse and manage your previously created line layouts
                  </p>
                </div>

                <motion.div
                  className="absolute bottom-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="mt-16 text-sm text-muted-foreground"
        >
          Factory Twin • v1.0
        </motion.p>
      </div>
    </div>
  );
};

export default PlanHomePage;
