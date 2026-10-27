import { describe, expect, it } from 'vitest';
import { commandNames } from '../modules/menu-module';

describe('Telegram bot command contract', () => {
  it('contains stable entry/help and referral commands', () => {
    expect(commandNames).toContain('/start');
    expect(commandNames).toContain('/help');
    expect(commandNames).toContain('/referral');
  });
});
