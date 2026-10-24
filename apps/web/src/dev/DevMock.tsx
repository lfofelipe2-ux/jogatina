import { GameProvider } from '../components/GameContext';
import GameView from '../components/GameView';
import type { GameApi } from '../api';
import { mockChat, mockProfile, mockRequests, mockState, type MockVariant } from './mockState';

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
  chat: ok,
  profile: async (playerId) => ({ ok: true as const, profile: mockProfile(playerId) }),
  requests: async () => ({ ok: true as const, requests: mockRequests(), canApprove: true }),
  requestCreate: ok,
  requestDecide: ok,
  requestReply: ok,
  onRequestUpdate: () => () => {},
};

export default function DevMock() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('v');
  const variant: MockVariant = v === 'result' || v === 'split' ? v : 'play';
  return (
    <GameProvider api={mockApi}>
      <GameView state={mockState(variant)} chat={mockChat()} onRotated={() => {}} initialRequestsOpen={params.get('requests') === '1'} />
    </GameProvider>
  );
}
