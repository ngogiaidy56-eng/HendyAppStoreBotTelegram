import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import BalanceCard from '../components/BalanceCard';

describe('BalanceCard', () => {
  it('formats VNĐ balance and delegates deposit click', () => {
    const onDeposit = vi.fn();
    render(<BalanceCard balanceVnd={123456} onDeposit={onDeposit} />);
    expect(screen.getByText(/123\.456/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /nạp tiền/i }));
    expect(onDeposit).toHaveBeenCalledTimes(1);
  });
});
