import React from 'react';
export type TaskView = { id: string; title: string; description: string; progress: number; targetCount: number; rewardVnd: number; status: string };
export function TaskListItem({ task, onClaim, busy = false }: { task: TaskView; onClaim: (id: string) => void; busy?: boolean }) {
  const done = task.status === 'completed';
  return <article className="panel task-item"><div><h3>{task.title}</h3><p>{task.description}</p><small>Tiến độ {Math.min(task.progress, task.targetCount)}/{task.targetCount} · Thưởng {new Intl.NumberFormat('vi-VN').format(task.rewardVnd)} ₫</small></div><button disabled={!done || busy || task.status === 'claimed'} onClick={() => onClaim(task.id)}>{task.status === 'claimed' ? 'Đã nhận' : done ? 'Nhận thưởng' : 'Chưa hoàn thành'}</button></article>;
}
export default TaskListItem;
