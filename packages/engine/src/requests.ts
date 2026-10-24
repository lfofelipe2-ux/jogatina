import type { Ack, SimpleResponse } from './protocol';

/**
 * Change requests for the project, sent from inside the game.
 * pending -> approved (admin) -> working (worker) -> preview (screenshots posted) -> merging (admin approved the preview)
 * -> waiting_deploy -> deployed, or rejected / failed. A reply on a preview sends it back to approved for another round.
 */
export type RequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'working'
  | 'preview'
  | 'merging'
  | 'waiting_deploy'
  | 'deployed'
  | 'failed';

export type RequestAuthor = 'player' | 'admin' | 'worker';

export interface RequestEvent {
  at: number;
  author: RequestAuthor;
  name: string;
  text: string;
  /** Screenshot URLs (worker previews). */
  images: string[];
}

export interface ChangeRequest {
  id: number;
  at: number;
  authorName: string;
  text: string;
  status: RequestStatus;
  prUrl: string | null;
  events: RequestEvent[];
}

export const REQUEST_MIN_LEN = 5;
export const REQUEST_MAX_LEN = 1000;
export const REQUEST_REPLY_MAX_LEN = 500;

export type RequestsResponse =
  | { ok: true; requests: ChangeRequest[]; canApprove: boolean }
  | { ok: false; error: string };

export interface RequestClientEvents {
  'requests:list': (ack: Ack<RequestsResponse>) => void;
  'requests:create': (req: { text: string }, ack: Ack<SimpleResponse>) => void;
  /** Admin only: approve or reject a pending request, or a preview (approve = merge and publish). */
  'requests:decide': (req: { id: number; approve: boolean }, ack: Ack<SimpleResponse>) => void;
  /** Comment on a request: the author or the admin, e.g. answering a question from the worker. */
  'requests:reply': (req: { id: number; text: string }, ack: Ack<SimpleResponse>) => void;
}

export interface RequestServerEvents {
  'requests:update': (req: ChangeRequest) => void;
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovado, na fila',
  rejected: 'Recusado',
  working: 'Worker trabalhando',
  preview: 'Prévia pronta, aguardando aprovação',
  merging: 'Aprovado, fazendo o merge',
  waiting_deploy: 'Pronto, aguardando mesas vazias para publicar',
  deployed: 'Publicado',
  failed: 'Falhou',
};
