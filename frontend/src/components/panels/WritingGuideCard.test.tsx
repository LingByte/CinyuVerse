import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  WritingGuideStep,
  WritingGuideStepId,
} from '@/hooks/useWritingPipelineProgress';
import { WritingGuideCard } from './WritingGuideCard';

const STEPS: WritingGuideStep[] = [
  { id: 'foundation', optional: false, done: true, active: false },
  { id: 'style', optional: true, done: false, active: false },
  { id: 'write', optional: false, done: false, active: true },
];

function renderCard(
  canRun: (id: WritingGuideStepId) => boolean = () => true,
  onAction: (id: WritingGuideStepId) => void = vi.fn()
) {
  render(
    <WritingGuideCard steps={STEPS} canRun={canRun} onAction={onAction} />
  );
  return { onAction };
}

describe('WritingGuideCard', () => {
  it('renders step labels and marks optional steps', () => {
    renderCard();
    expect(screen.getByText('初始化作品基础')).toBeInTheDocument();
    expect(screen.getByText('提炼参考文风')).toBeInTheDocument();
    expect(screen.getByText('可选')).toBeInTheDocument();
  });

  it('hides the start button for completed steps', () => {
    renderCard();
    const buttons = screen.getAllByRole('button', { name: '开始' });
    // foundation is done → only style + write keep their buttons
    expect(buttons).toHaveLength(2);
  });

  it('fires onAction with the step id when Start is clicked', () => {
    const { onAction } = renderCard();
    fireEvent.click(screen.getAllByRole('button', { name: '开始' })[1]);
    expect(onAction).toHaveBeenCalledWith('write');
  });

  it('disables steps the caller marks as not runnable', () => {
    renderCard((id) => id !== 'write');
    const writeButton = screen
      .getAllByRole('button', { name: '开始' })
      .find((b) => b.closest('li')?.textContent?.includes('撰写当前节拍'));
    expect(writeButton).toBeDisabled();
  });

  it('expands a step description on row click and collapses on re-click', () => {
    renderCard();
    const writeRow = screen.getByRole('button', {
      name: /撰写当前节拍/,
      expanded: false,
    });
    fireEvent.click(writeRow);
    expect(screen.getByText(/完整流水线①–⑦/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /撰写当前节拍/, expanded: true })
    );
    expect(screen.queryByText(/完整流水线①–⑦/)).not.toBeInTheDocument();
  });

  it('expands only one step at a time', () => {
    renderCard();
    fireEvent.click(
      screen.getByRole('button', { name: /撰写当前节拍/, expanded: false })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /提炼参考文风/, expanded: false })
    );
    expect(screen.queryByText(/完整流水线①–⑦/)).not.toBeInTheDocument();
    expect(screen.getByText(/style-sample\.md/)).toBeInTheDocument();
  });

  it('keeps the row collapsed when Start is clicked', () => {
    const { onAction } = renderCard();
    fireEvent.click(screen.getAllByRole('button', { name: '开始' })[1]);
    expect(onAction).toHaveBeenCalledWith('write');
    expect(
      screen.queryByRole('button', { name: /撰写当前节拍/, expanded: true })
    ).not.toBeInTheDocument();
  });
});
