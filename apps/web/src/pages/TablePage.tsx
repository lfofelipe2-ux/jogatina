import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ClientTableState, JoinTableResponse } from '@poker/engine';
import { socket } from '../socket';
import { socketApi } from '../api';
import { GameProvider, useGame } from '../components/GameContext';
import GameView from '../components/GameView';
import JoinForm from '../components/JoinForm';
import { syncServerClock } from '../components/Timer';
import { failureMessage } from '../lib/errors';
import { NAME_KEY, hostKey, moveTableKeys, readItem, removeItem, rtKey, writeItem } from '../lib/storage';

const JOIN_TIMEOUT_MS = 10_000;

export default function TablePage() {
  const { tableId = '' } = useParams();
  return (
    <GameProvider api={socketApi}>
      <TableRoom key={tableId} tableId={tableId} />
    </GameProvider>
  );
}

function TableRoom({ tableId }: { tableId: string }) {
  const navigate = useNavigate();
  const { toast } = useGame();
  const [state, setState] = useState<ClientTableState | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(
    () => readItem(rtKey(tableId)) !== null && readItem(NAME_KEY) !== null,
  );
  const [joinError, setJoinError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const nameRef = useRef<string | null>(null);
  const movingRef = useRef(false);
  const joinSeq = useRef(0);

  const join = useCallback(
    (name: string) => {
      nameRef.current = name;
      setJoining(true);
      const seq = ++joinSeq.current;
      const timer = window.setTimeout(() => {
        if (seq !== joinSeq.current) return;
        joinSeq.current++;
        nameRef.current = null;
        setJoining(false);
        setJoinError('Sem resposta do servidor. Tente de novo.');
        // A late ack could still bind this socket to the table; start from a fresh connection.
        if (socket.connected) {
          socket.disconnect();
          socket.connect();
        }
      }, JOIN_TIMEOUT_MS);
      if (!socket.connected) {
        // onConnect retries the join with nameRef once the socket is back.
        if (!socket.active) socket.connect();
        return;
      }
      socket.emit(
        'joinTable',
        {
          tableId,
          name,
          reconnectToken: readItem(rtKey(tableId)) ?? undefined,
          hostToken: readItem(hostKey(tableId)) ?? undefined,
        },
        (res: JoinTableResponse) => {
          window.clearTimeout(timer);
          if (seq !== joinSeq.current) return;
          setJoining(false);
          if (res.ok) {
            writeItem(rtKey(tableId), res.reconnectToken);
            writeItem(NAME_KEY, name);
            setKicked(false);
            setJoinError(null);
            setJoined(true);
          } else {
            setJoined(false);
            setJoinError(failureMessage(res.error));
          }
        },
      );
    },
    [tableId],
  );

  const handleRotated = useCallback(
    (next: string) => {
      if (next === tableId || movingRef.current) return;
      movingRef.current = true;
      moveTableKeys(tableId, next);
      navigate(`/t/${next}`, { replace: true });
    },
    [navigate, tableId],
  );

  useEffect(() => {
    const savedName = () => nameRef.current ?? (readItem(rtKey(tableId)) !== null ? readItem(NAME_KEY) : null);
    const onConnect = () => {
      setConnected(true);
      const name = savedName();
      if (name) join(name);
    };
    const onDisconnect = (reason: string) => {
      setConnected(false);
      // A server-side disconnect (e.g. after a kick) is not retried automatically.
      if (reason === 'io server disconnect') socket.connect();
    };
    const onState = (s: ClientTableState) => {
      syncServerClock(s.serverNow);
      setState(s);
    };
    const onKicked = () => {
      removeItem(rtKey(tableId));
      nameRef.current = null;
      setState(null);
      setJoined(false);
      setKicked(true);
    };
    const onError = (e: { message: string }) => toast(e.message);
    const onLinkRotated = (e: { tableId: string }) => handleRotated(e.tableId);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    socket.on('kicked', onKicked);
    socket.on('error', onError);
    socket.on('linkRotated', onLinkRotated);
    if (socket.connected) onConnect();
    else {
      // Arms the join timeout and makes sure the socket is connecting.
      const name = savedName();
      if (name) join(name);
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
        socket.off('kicked', onKicked);
      socket.off('error', onError);
      socket.off('linkRotated', onLinkRotated);
    };
  }, [tableId, join, handleRotated, toast]);

  // The protocol has no leave event: drop the connection on unmount so the server
  // removes this socket from the table room, then reconnect for the next page.
  useEffect(
    () => () => {
      joinSeq.current++;
      socket.disconnect();
      socket.connect();
    },
    [],
  );

  if (joined && state) {
    return (
      <>
        {!connected && (
          <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-3 py-1 text-center text-sm font-semibold text-slate-900">
            Reconectando…
          </div>
        )}
        <GameView state={state} onRotated={handleRotated} connected={connected} />
      </>
    );
  }

  if (joined) {
    return <p className="p-8 text-center text-slate-400">Carregando mesa…</p>;
  }

  return (
    <JoinForm
      initialName={readItem(NAME_KEY) ?? ''}
      error={joinError}
      notice={kicked ? 'Você foi removido desta mesa.' : null}
      pending={joining}
      onSubmit={join}
    />
  );
}
