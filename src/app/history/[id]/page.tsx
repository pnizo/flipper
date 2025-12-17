'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { GameResult, getGameResult } from '@/lib/firestore';
import styles from './page.module.css';

export default function HistoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading, isConfigured } = useAuth();
  const resultId = params.id as string;

  const [result, setResult] = useState<GameResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/');
      return;
    }

    const loadResult = async () => {
      try {
        const data = await getGameResult(resultId);
        setResult(data);
      } catch (err) {
        console.error('Failed to load result:', err);
      } finally {
        setLoading(false);
      }
    };

    loadResult();
  }, [resultId, user, authLoading, router]);

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

  if (!result) {
    return (
      <main className={styles.main}>
        <div className={styles.error}>
          <p>結果が見つかりません</p>
          <button onClick={() => router.push('/history')} className="btn btn-secondary">
            履歴に戻る
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <button onClick={() => router.push('/history')} className={styles.backButton}>
          ← 履歴一覧
        </button>
        <div className={styles.headerInfo}>
          <span className={styles.roomCode}>Room: {result.roomCode}</span>
          <span className={styles.date}>
            {result.createdAt?.toDate?.()?.toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }) || ''}
          </span>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.questionPanel}>
          <h2>お題</h2>
          <p className={styles.questionText}>{result.questionText}</p>
          {result.questionImageURL && (
            <img
              src={result.questionImageURL}
              alt="お題の画像"
              className={styles.questionImage}
            />
          )}
        </div>

        <div className={styles.answersPanel}>
          <h2>回答一覧 ({result.answers.length}人)</h2>
          <div className={styles.answersGrid}>
            {result.answers.map((answer, idx) => (
              <div
                key={idx}
                className={`${styles.answerCard} ${answer.isCorrect ? styles.correct : styles.incorrect}`}
              >
                <div className={styles.answerHeader}>
                  <span className={styles.answerName}>{answer.displayName}</span>
                  {answer.isCorrect && (
                    <span className={styles.correctBadge}>正解!</span>
                  )}
                </div>
                <div className={styles.answerImage}>
                  <img src={answer.imageURL} alt={`${answer.displayName}の回答`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>回答者数</span>
            <span className={styles.summaryValue}>{result.answers.length}人</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>正解者数</span>
            <span className={styles.summaryValueCorrect}>
              {result.answers.filter((a) => a.isCorrect).length}人
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
