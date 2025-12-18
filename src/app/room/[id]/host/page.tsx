'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Room,
  RoomParticipant,
  Answer,
  Question,
  BannedUser,
  getRoom,
  subscribeToRoom,
  subscribeToParticipants,
  subscribeToAnswers,
  subscribeToBannedUsers,
  createQuestion as createQuestionFn,
  toggleAnswerCorrect,
  openAnswers,
  toggleAnswerReveal,
  revealAllAnswers,
  resetRoomToWaiting,
  endRoom,
  saveGameResult,
  getQuestion,
  kickParticipant,
  unbanUser,
  MAX_PARTICIPANTS,
} from '@/lib/firestore';
import styles from './page.module.css';

export default function HostPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const roomId = params.id as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [questionText, setQuestionText] = useState('');
  const [questionImage, setQuestionImage] = useState<File | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [isCreatingQuestion, setIsCreatingQuestion] = useState(false);
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEndModal, setShowEndModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/');
      return;
    }

    const loadRoom = async () => {
      const roomData = await getRoom(roomId);
      if (!roomData) {
        setError('ルームが見つかりません');
        setLoading(false);
        return;
      }
      if (roomData.hostId !== user.uid) {
        setError('このルームの司会者ではありません');
        setLoading(false);
        return;
      }
      setRoom(roomData);
      setLoading(false);
    };

    loadRoom();

    // Subscribe to room changes
    const unsubRoom = subscribeToRoom(roomId, setRoom);
    const unsubParticipants = subscribeToParticipants(roomId, setParticipants);
    const unsubBanned = subscribeToBannedUsers(roomId, setBannedUsers);

    return () => {
      unsubRoom();
      unsubParticipants();
      unsubBanned();
    };
  }, [roomId, user, authLoading, router]);

  // Subscribe to answers and load current question
  useEffect(() => {
    if (!room?.currentQuestionId) {
      setCurrentQuestion(null);
      return;
    }

    // Load current question
    getQuestion(roomId, room.currentQuestionId).then(setCurrentQuestion);

    const unsub = subscribeToAnswers(roomId, room.currentQuestionId, setAnswers);
    return () => unsub();
  }, [roomId, room?.currentQuestionId]);

  const handleKick = async (participant: RoomParticipant) => {
    console.log('handleKick called for:', participant.displayName);
    if (!confirm(`${participant.displayName} をキック（退室）しますか？`)) {
      console.log('Kick canceled by user');
      return;
    }

    try {
      console.log('Calling kickParticipant...');
      await kickParticipant(
        roomId,
        participant.id,
        participant.odId,
        participant.displayName,
        participant.photoURL
      );
      console.log('kickParticipant successful');
    } catch (err) {
      console.error('kickParticipant failed:', err);
      setError('キックに失敗しました');
    }
  };

  const handleUnban = async (odId: string, displayName: string) => {
    console.log('handleUnban called for:', displayName);
    if (!confirm(`${displayName} のBANを解除しますか？`)) {
      console.log('Unban canceled by user');
      return;
    }

    try {
      console.log('Calling unbanUser...');
      await unbanUser(roomId, odId);
      console.log('unbanUser successful');
    } catch (err) {
      console.error('unbanUser failed:', err);
      setError('BAN解除に失敗しました');
    }
  };

  const handleCreateQuestion = async () => {
    if (!questionText.trim()) return;

    setIsCreatingQuestion(true);
    try {
      await createQuestionFn(roomId, questionText, questionImage);
      setQuestionText('');
      setQuestionImage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Failed to create question:', err);
      setError('質問の作成に失敗しました');
    } finally {
      setIsCreatingQuestion(false);
    }
  };

  const handleToggleCorrect = async (answerId: string, currentState: boolean) => {
    await toggleAnswerCorrect(roomId, answerId, !currentState);
  };

  const handleToggleReveal = async (answerId: string, currentState: boolean) => {
    await toggleAnswerReveal(roomId, answerId, !currentState);
  };

  const handleRevealAll = async () => {
    if (!room?.currentQuestionId) return;
    if (!confirm('全ての回答をオープンしますか？')) return;
    await revealAllAnswers(roomId, room.currentQuestionId);
  };

  const handleOpen = async () => {
    if (!room || !currentQuestion || !user) return;

    setIsSavingHistory(true);
    try {
      // Save to history first
      await saveGameResult(
        roomId,
        room.roomCode,
        user.uid,
        currentQuestion,
        answers
      );
      // Then open answers
      await openAnswers(roomId);
    } catch (err) {
      console.error('Failed to save history:', err);
    } finally {
      setIsSavingHistory(false);
    }
  };

  const handleResetToWaiting = async () => {
    await resetRoomToWaiting(roomId);
  };

  const handleEndRoom = async () => {
    try {
      await endRoom(roomId);
      router.push('/');
    } catch (err) {
      console.error('Failed to end room:', err);
    }
  };

  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (!room?.roomCode) return;
    const url = `${window.location.origin}/?code=${room.roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || authLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>読み込み中...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.main}>
        <div className={styles.error}>
          <p>{error}</p>
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
        <button onClick={() => setShowEndModal(true)} className={styles.backButton}>
          ← 終了・退出
        </button>
        <h1 className={styles.title}>司会者画面</h1>
        <div
          className={styles.roomCode}
          onClick={handleCopyCode}
          title="クリックして参加用URLをコピー"
        >
          ルームコード: <span>{room?.roomCode}</span>
          {copied && <span className={styles.copyBadge}>コピーしました！</span>}
        </div>
        <button
          onClick={() => window.open(`/room/${roomId}/broadcast`, '_blank')}
          className="btn btn-secondary"
        >
          放送画面を開く
        </button>
        <button
          onClick={() => router.push('/history')}
          className="btn btn-secondary"
        >
          📚 履歴
        </button>
      </div>

      <div className={styles.layout}>
        {/* Left sidebar - Participants */}
        <aside className={styles.sidebar}>
          <div className={styles.panel}>
            <h2>参加者 ({participants.length}/{room?.maxParticipants || MAX_PARTICIPANTS})</h2>
            <div className={styles.participantList}>
              {participants.map((p) => (
                <div key={p.id} className={styles.participant}>
                  {p.photoURL && (
                    <img src={p.photoURL} alt="" className={styles.avatar} />
                  )}
                  <span className={styles.name}>{p.displayName}</span>
                  <button
                    onClick={() => handleKick(p)}
                    className={styles.kickBtn}
                    title="キック（退室）"
                  >
                    🚫
                  </button>
                </div>
              ))}
              {participants.length === 0 && (
                <p className={styles.empty}>参加者なし</p>
              )}
            </div>
          </div>

          {bannedUsers.length > 0 && (
            <div className={styles.panel}>
              <h2>退室済み ({bannedUsers.length})</h2>
              <div className={styles.participantList}>
                {bannedUsers.map((b) => (
                  <div key={b.odId} className={styles.participant}>
                    {b.photoURL && (
                      <img src={b.photoURL} alt="" className={styles.avatar} />
                    )}
                    <span className={styles.name}>{b.displayName}</span>
                    <button
                      onClick={() => handleUnban(b.odId, b.displayName)}
                      className={styles.unbanBtn}
                      title="BANを解除"
                    >
                      ✓
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className={styles.content}>
          {/* Question form */}
          {/* Question form or Display */}
          <div className={styles.panel}>
            {room?.status === 'waiting' || !room?.currentQuestionId ? (
              <>
                <h2>質問を出題</h2>
                <div className={styles.questionForm}>
                  <textarea
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="質問を入力してください..."
                    className={styles.textarea}
                    rows={3}
                  />
                  <div className={styles.imageUpload}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setQuestionImage(e.target.files?.[0] || null)}
                      ref={fileInputRef}
                    />
                    {questionImage && (
                      <span className={styles.fileName}>{questionImage.name}</span>
                    )}
                  </div>
                  <button
                    onClick={handleCreateQuestion}
                    disabled={isCreatingQuestion || !questionText.trim()}
                    className="btn btn-primary"
                  >
                    {isCreatingQuestion ? '作成中...' : '質問を出題'}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.questionDisplay}>
                <div className={styles.questionHeader}>
                  <h2>出題中の質問</h2>
                  <div className={styles.statusBadge}>
                    {room.status === 'questioning' ? '回答受付中' : '結果発表中'}
                  </div>
                </div>
                <div className={styles.questionContent}>
                  <p className={styles.questionText}>{currentQuestion?.text}</p>
                  {currentQuestion?.imageURL && (
                    <img
                      src={currentQuestion.imageURL}
                      alt="質問画像"
                      className={styles.questionImage}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Answers grid */}
          {room?.currentQuestionId && (
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>回答一覧</h2>
                <div className={styles.statusBadge}>
                  {room.status === 'questioning' && '回答中'}
                  {room.status === 'open' && 'オープン済み'}
                </div>
              </div>

              <div className={styles.answersGrid}>
                {answers.map((answer) => (
                  <div
                    key={answer.id}
                    className={`${styles.answerCard} ${answer.isCorrect ? styles.correct : ''}`}
                  >
                    <div className={styles.answerHeader}>
                      <span className={styles.answerName}>{answer.displayName}</span>
                      <div className={styles.answerActions}>
                        <button
                          onClick={() => handleToggleReveal(answer.id, answer.isRevealed)}
                          className={`${styles.actionBtn} ${answer.isRevealed ? styles.revealed : ''}`}
                          title={answer.isRevealed ? "隠す" : "オープン"}
                          disabled={room.status === 'questioning'}
                        >
                          {answer.isRevealed ? '👁️' : '🙈'}
                        </button>
                        <button
                          onClick={() => handleToggleCorrect(answer.id, answer.isCorrect)}
                          className={`${styles.actionBtn} ${answer.isCorrect ? styles.correct : ''}`}
                          title="正解/不正解"
                        >
                          {answer.isCorrect ? '⭕' : '❌'}
                        </button>
                      </div>
                    </div>
                    <div className={styles.answerCanvas}>
                      <img
                        src={answer.canvasData}
                        alt={`${answer.displayName}の回答`}
                      />
                    </div>
                  </div>
                ))}
                {answers.length === 0 && (
                  <p className={styles.empty}>まだ回答がありません</p>
                )}
              </div>

              <div className={styles.controls}>
                {room.status === 'questioning' && (
                  <button
                    onClick={handleOpen}
                    disabled={isSavingHistory}
                    className="btn btn-success"
                  >
                    {isSavingHistory ? '保存中...' : '🎉 回答を締め切る'}
                  </button>
                )}
                {room.status === 'open' && (
                  <>
                    <button onClick={handleRevealAll} className="btn btn-primary">
                      ✨ 全てオープン
                    </button>
                    <button onClick={handleResetToWaiting} className="btn btn-secondary">
                      次の質問へ
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showEndModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2>ルームを終了しますか？</h2>
            <p>ルームを終了して退出します。参加者全員の接続も切断されます。</p>
            <div className={styles.modalActions}>
              <button
                onClick={() => setShowEndModal(false)}
                className="btn btn-secondary"
              >
                キャンセル
              </button>
              <button
                onClick={handleEndRoom}
                className="btn btn-danger"
              >
                終了して退出
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
