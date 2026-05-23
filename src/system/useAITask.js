/**
 * Immortail™ — useAITask  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that subscribes to the global AI task manager.
 * Returns live task state for the overlay + any consumer that needs it.
 *
 * Usage:
 *   const { task, isActive } = useAITask();
 */
import { useState, useEffect } from 'react';
import { subscribeToTask, isTaskActive } from './aiTaskManager.js';

export function useAITask() {
  const [task, setTask] = useState(null);

  useEffect(() => {
    const unsub = subscribeToTask(setTask);
    return unsub;
  }, []);

  return {
    task,
    isActive:     !!task && !task.completed && !task.failed && !task.cancelled,
    isFailed:     !!task?.failed,
    isCompleted:  !!task?.completed,
    isCancelled:  !!task?.cancelled,
  };
}
