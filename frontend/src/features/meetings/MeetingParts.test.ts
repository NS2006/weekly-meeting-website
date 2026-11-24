import { describe, expect, it } from 'vitest';
import { movedFrom, noteCountLabel } from './MeetingParts';

describe('a meeting row', () => {
  const today = '2026-11-23';

  it('says where a moved meeting was, in English or Indonesian', () => {
    const moved = { date: '2026-11-26', scheduledDate: '2026-11-25' };
    expect(movedFrom(moved, 'en')).toBe('Moved from Wed 25 Nov');
    expect(movedFrom(moved, 'id')).toBe('Dipindahkan dari Rab, 25 Nov');
    expect(movedFrom({ date: '2026-11-25', scheduledDate: '2026-11-25' }, 'id')).toBeNull();
  });

  it('counts its notes, in English or Indonesian', () => {
    expect(noteCountLabel({ date: '2026-11-25', noteCount: 0 }, today, 'en')).toBe('No notes yet');
    expect(noteCountLabel({ date: '2026-11-20', noteCount: 0 }, today, 'en')).toBe('No notes');
    expect(noteCountLabel({ date: '2026-11-20', noteCount: 1 }, today, 'en')).toBe('1 note');
    expect(noteCountLabel({ date: '2026-11-20', noteCount: 4 }, today, 'en')).toBe('4 notes');
    expect(noteCountLabel({ date: '2026-11-25', noteCount: 0 }, today, 'id')).toBe('Belum ada catatan');
    expect(noteCountLabel({ date: '2026-11-20', noteCount: 0 }, today, 'id')).toBe('Tidak ada catatan');
    expect(noteCountLabel({ date: '2026-11-20', noteCount: 4 }, today, 'id')).toBe('4 catatan');
  });
});
