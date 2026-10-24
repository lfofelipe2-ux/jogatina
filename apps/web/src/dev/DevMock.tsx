import { GameProvider } from '../components/GameContext';
import GameView from '../components/GameView';
import type { GameApi } from '../api';
import { mockState, type MockVariant } from './mockState';

const ok = async () => ({ ok: true as const });

const mockApi: GameApi = {
  sit: ok,
  standUp: ok,
  action: async (type, amount) => {
    console.log('action', type, amount);
    return { ok: false, error: 'Modo de teste: ação não enviada.' };
  },
  start: ok,
  kick: ok,
  rotateLink: async () => ({ ok: true as const, tableId: 'mock' }),
};

export default function DevMock() {
  const v = new URLSearchParams(window.location.search).get('v');
  const variant: MockVariant = v === 'result' || v === 'split' ? v : 'play';
  return (
    <GameProvider api={mockApi}>
      <GameView state={mockState(variant)} onRotated={() => {}} />
    </GameProvider>
  );
}
