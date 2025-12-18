'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createRoom, getRoomByCode, requestJoinRoom } from '@/lib/firestore';
import styles from './page.module.css';

function HomeContent() {
  const { user, userProfile, loading, isConfigured, signInWithGoogle, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(10); // Default 10

  // Handle URL query parameter
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setRoomCode(code.toUpperCase());
    }
  }, [searchParams]);

  const handleCreateRoom = async () => {
    if (!user || !userProfile) return;

    setIsCreating(true);
    setError('');

    try {
      const room = await createRoom(user.uid, maxParticipants);
      router.push(`/room/${room.id}/host`);
    } catch (err) {
      console.error('Failed to create room:', err);
      setError('ルームの作成に失敗しました');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!user || !userProfile || !roomCode.trim()) return;

    setIsJoining(true);
    setError('');

    try {
      const room = await getRoomByCode(roomCode.trim());
      if (!room) {
        setError('ルームが見つかりません');
        return;
      }

      // Request to join
      await requestJoinRoom(
        room.id,
        user.uid,
        userProfile.displayName || '匿名',
        userProfile.photoURL
      );

      router.push(`/room/${room.id}/answer`);
    } catch (err) {
      console.error('Failed to join room:', err);
      const message = err instanceof Error ? err.message : 'ルームへの参加に失敗しました';
      setError(message);
      if (message.includes('退室させられています')) {
        alert(message);
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
    // Extract room code from URL like ...?code=ABC123 or just the code at the end
    const urlMatch = pastedText.match(/[?&]code=([A-Z0-9]{6})/i);
    if (urlMatch) {
      setRoomCode(urlMatch[1].toUpperCase());
      e.preventDefault();
    } else if (pastedText.includes('/') && pastedText.length > 6) {
      // If it looks like a URL but doesn't have ?code=, try to find a 6-char code
      const possibleCode = pastedText.split('/').pop()?.split('?')[0];
      if (possibleCode && /^[A-Z0-9]{6}$/i.test(possibleCode)) {
        setRoomCode(possibleCode.toUpperCase());
        e.preventDefault();
      }
    }
  };

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>読み込み中...</div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>
          <span className={styles.titleIcon}>📋</span>
          Flipper
        </h1>
        <p className={styles.subtitle}>クイズ番組風フリップ回答システム</p>

        {!user ? (
          <div className={styles.authSection}>
            <button onClick={signInWithGoogle} className="btn btn-primary">
              Googleでログイン
            </button>
          </div>
        ) : (
          <div className={styles.userSection}>
            <div className={styles.userInfo}>
              {userProfile?.photoURL && (
                <img
                  src={userProfile.photoURL}
                  alt="Avatar"
                  className={styles.avatar}
                />
              )}
              <div className={styles.userDetails}>
                <span className={styles.displayName}>
                  {userProfile?.displayName || 'ゲスト'}
                </span>
                <span className={styles.email}>{user.email}</span>
              </div>
              <button onClick={() => router.push('/settings')} className={styles.settingsBtn}>
                ⚙️
              </button>
              <button onClick={() => router.push('/history')} className={styles.settingsBtn}>
                📚
              </button>
              <button onClick={signOut} className="btn btn-secondary">
                ログアウト
              </button>
            </div>

            <div className={styles.actions}>
              <div className={styles.actionCard}>
                <h2>司会者としてルームを作成</h2>
                <p>新しいクイズルームを作成して、参加者を招待しましょう</p>
                <div className={styles.createForm}>
                  <label className={styles.inputLabel}>
                    最大参加人数
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={maxParticipants}
                      onChange={(e) => setMaxParticipants(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                      className={styles.numberInput}
                    />
                    人
                  </label>
                  <button
                    onClick={handleCreateRoom}
                    disabled={isCreating}
                    className="btn btn-primary"
                  >
                    {isCreating ? '作成中...' : 'ルームを作成'}
                  </button>
                </div>
              </div>

              <div className={styles.divider}>
                <span>または</span>
              </div>

              <div className={styles.actionCard}>
                <h2>回答者としてルームに参加</h2>
                <p>ルームコードを入力して参加しましょう</p>
                <div className={styles.joinForm}>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    onPaste={handlePaste}
                    placeholder="ルームコード (例: ABC123)"
                    maxLength={6}
                    className="input"
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={isJoining || roomCode.length < 6}
                    className="btn btn-success"
                  >
                    {isJoining ? '参加中...' : '参加する'}
                  </button>
                </div>
              </div>

              {error && <div className={styles.error}>{error}</div>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className={styles.main}>
        <div className={styles.loading}>読み込み中...</div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}
