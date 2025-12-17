'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import DrawingCanvas from '@/components/DrawingCanvas';
import {
  Room,
  RoomParticipant,
  Question,
  subscribeToRoom,
  getMyParticipation,
  getQuestion,
  submitAnswer,
  requestJoinRoom,
} from '@/lib/firestore';
import styles from './page.module.css';

export default function AnswerPage() {
  const params = useParams();
  const router = useRouter();
  const { user, userProfile, loading: authLoading } = useAuth();
  const roomId = params.id as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [participation, setParticipation] = useState<RoomParticipant | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [canvasData, setCanvasData] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitTime, setLastSubmitTime] = useState(0);

  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load room and participation
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/');
      return;
    }

    const loadData = async () => {
      const myParticipation = await getMyParticipation(roomId, user.uid);

      if (!myParticipation) {
        // Try to join if not already a participant
        try {
          const newParticipation = await requestJoinRoom(
            roomId,
            user.uid,
            userProfile?.displayName || '匿名',
            userProfile?.photoURL || null
          );
          setParticipation(newParticipation);
        } catch (err) {
          console.error('Failed to join room:', err);
        }
      } else {
        setParticipation(myParticipation);
      }

      setLoading(false);
    };

    loadData();

    // Subscribe to room changes
    const unsub = subscribeToRoom(roomId, async (roomData) => {
      setRoom(roomData);

      if (roomData?.currentQuestionId) {
        const q = await getQuestion(roomId, roomData.currentQuestionId);
        setQuestion(q);
      } else {
        setQuestion(null);
      }
    });

    return () => unsub();
  }, [roomId, user, userProfile, authLoading, router]);

  // Auto-save answer periodically
  useEffect(() => {
    if (!room?.currentQuestionId || !canvasData || room.status !== 'questioning') {
      return;
    }

    const saveAnswer = async () => {
      if (!user || !userProfile) return;

      const now = Date.now();
      if (now - lastSubmitTime < 2000) return; // Throttle to every 2 seconds

      try {
        await submitAnswer(
          roomId,
          room.currentQuestionId!,
          user.uid,
          userProfile.displayName || '匿名',
          canvasData
        );
        setLastSubmitTime(now);
      } catch (err) {
        console.error('Failed to save answer:', err);
      }
    };

    // Save every 3 seconds
    autoSaveIntervalRef.current = setInterval(saveAnswer, 3000);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [room?.currentQuestionId, room?.status, canvasData, user, userProfile, roomId, lastSubmitTime]);

  const handleCanvasChange = useCallback((dataUrl: string) => {
    setCanvasData(dataUrl);
  }, []);

  const handleSubmit = async () => {
    if (!user || !userProfile || !room?.currentQuestionId || !canvasData) return;

    setSubmitting(true);
    try {
      await submitAnswer(
        roomId,
        room.currentQuestionId,
        user.uid,
        userProfile.displayName || '匿名',
        canvasData
      );
    } catch (err) {
      console.error('Failed to submit answer:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>読み込み中...</div>
      </main>
    );
  }

  if (participation?.status === 'pending') {
    return (
      <main className={styles.main}>
        <div className={styles.waiting}>
          <div className={styles.waitingIcon}>⏳</div>
          <h2>入室申請中...</h2>
          <p>司会者の承認をお待ちください</p>
        </div>
      </main>
    );
  }

  if (participation?.status === 'rejected') {
    return (
      <main className={styles.main}>
        <div className={styles.rejected}>
          <div className={styles.rejectedIcon}>❌</div>
          <h2>入室が拒否されました</h2>
          <button onClick={() => router.push('/')} className="btn btn-secondary">
            ホームに戻る
          </button>
        </div>
      </main>
    );
  }

  if (room?.status === 'ended') {
    return (
      <main className={styles.main}>
        <div className={styles.rejected}>
          <div className={styles.rejectedIcon}>👋</div>
          <h2>ルームが終了しました</h2>
          <p>司会者がルームを終了しました。</p>
          <button onClick={() => router.push('/')} className="btn btn-secondary">
            ホームに戻る
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <button onClick={() => router.push('/')} className={styles.backButton}>
          ← ホーム
        </button>
        <h1 className={styles.title}>回答画面</h1>
        {room?.roomCode && (
          <div className={styles.status}>
            Room: <span style={{ fontFamily: 'var(--font-geist-mono)', fontWeight: 700 }}>{room.roomCode}</span>
          </div>
        )}
        <div className={styles.status}>
          {room?.status === 'waiting' && '待機中'}
          {room?.status === 'questioning' && '回答中'}
          {room?.status === 'open' && 'オープン！'}
        </div>
      </div>

      <div className={styles.content}>
        {!question && room?.status === 'waiting' && (
          <div className={styles.noQuestion}>
            <div className={styles.noQuestionIcon}>📝</div>
            <h2>質問を待っています...</h2>
            <p>司会者が質問を出題するまでお待ちください</p>
          </div>
        )}

        {question && (
          <>
            <div className={styles.questionPanel}>
              <h2>質問</h2>
              <p className={styles.questionText}>{question.text}</p>
              {question.imageURL && (
                <img
                  src={question.imageURL}
                  alt="質問画像"
                  className={styles.questionImage}
                />
              )}
            </div>

            <div className={styles.answerPanel}>
              <h2>あなたの回答</h2>
              {room?.status === 'questioning' ? (
                <>
                  <DrawingCanvas
                    width={400}
                    height={300}
                    onChange={handleCanvasChange}
                  />
                  <p className={styles.autoSaveHint}>
                    ※ 回答は自動的に保存されます
                  </p>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !canvasData}
                    className="btn btn-success"
                  >
                    {submitting ? '保存中...' : '回答を保存'}
                  </button>
                </>
              ) : room?.status === 'open' ? (
                <div className={styles.openMessage}>
                  <div className={styles.openIcon}>🎉</div>
                  <h3>回答がオープンされました！</h3>
                  <p>放送画面をご覧ください</p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
