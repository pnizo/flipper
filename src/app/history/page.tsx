'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { GameResult, getGameHistory } from '@/lib/firestore';
import styles from './page.module.css';

export default function HistoryPage() {
  const { user, loading: authLoading, isConfigured } = useAuth();
  const router = useRouter();
  const [history, setHistory] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/');
      return;
    }

    const loadHistory = async () => {
      try {
        const results = await getGameHistory(user.uid);
        // Sort by createdAt descending
        results.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        setHistory(results);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [user, authLoading, router]);

  if (!isConfigured) {
    return (
      <main className={styles.main}>
        <div className={styles.error}>Firebaseが設定されていません</div>
      </main>
    );
  }

  if (loading || authLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>読み込み中...</div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <button onClick={() => router.push('/')} className={styles.backButton}>
          ← ホーム
        </button>
        <h1 className={styles.title}>📚 ゲーム履歴</h1>
      </div>

      <div className={styles.content}>
        {history.length === 0 ? (
          <div className={styles.empty}>
            <p>まだ履歴がありません</p>
            <p>クイズを出題してオープンすると、結果がここに保存されます</p>
          </div>
        ) : (
          <div className={styles.historyList}>
            {history.map((result) => (
              <div
                key={result.id}
                className={styles.historyCard}
                onClick={() => router.push(`/history/${result.id}`)}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.roomCode}>Room: {result.roomCode}</span>
                  <span className={styles.date}>
                    {result.createdAt?.toDate?.()?.toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }) || '日付不明'}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.questionText}>{result.questionText}</p>
                  <div className={styles.answerPreview}>
                    {result.answers.slice(0, 4).map((answer, idx) => (
                      <div
                        key={idx}
                        className={`${styles.answerThumb} ${answer.isCorrect ? styles.correct : ''}`}
                      >
                        <img src={answer.imageURL} alt={answer.displayName} />
                      </div>
                    ))}
                    {result.answers.length > 4 && (
                      <div className={styles.moreAnswers}>
                        +{result.answers.length - 4}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <span className={styles.answerCount}>
                    {result.answers.length}人の回答
                  </span>
                  <span className={styles.correctCount}>
                    正解: {result.answers.filter((a) => a.isCorrect).length}人
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
