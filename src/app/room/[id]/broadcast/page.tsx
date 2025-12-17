'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Room,
  Question,
  Answer,
  subscribeToRoom,
  getQuestion,
  subscribeToAnswers,
} from '@/lib/firestore';
import styles from './page.module.css';

export default function BroadcastPage() {
  const params = useParams();
  const roomId = params.id as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  // Remove local isRevealed state and effect. logic derived from room.status and answer.isRevealed

  // Subscribe to room changes
  useEffect(() => {
    const unsub = subscribeToRoom(roomId, setRoom);
    return () => unsub();
  }, [roomId]);

  // Subscribe to answers and load question when room updates
  useEffect(() => {
    if (!room?.currentQuestionId) {
      setQuestion(null);
      setAnswers([]);
      return;
    }

    // Load question
    getQuestion(roomId, room.currentQuestionId).then(setQuestion);

    // Subscribe to answers
    const unsub = subscribeToAnswers(roomId, room.currentQuestionId, setAnswers);
    return () => unsub();
  }, [roomId, room?.currentQuestionId]);

  // Draw answers on canvases (only for revealed ones)
  useEffect(() => {
    answers.forEach((answer) => {
      // Only draw if room is open and answer is revealed
      if (room?.status !== 'open' || !answer.isRevealed) return;

      const canvas = canvasRefs.current.get(answer.id);
      if (!canvas || !answer.canvasData) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        const { width, height } = canvas;

        // Set background color based on correct/incorrect
        ctx.fillStyle = answer.isCorrect ? '#dc2626' : '#2563eb';
        ctx.fillRect(0, 0, width, height);

        // Process image: convert black lines to white
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');

        if (tempCtx) {
          tempCtx.drawImage(img, 0, 0);
          const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // If pixel is dark (drawing), make it white
            if (r < 128 && g < 128 && b < 128) {
              data[i] = 255;
              data[i + 1] = 255;
              data[i + 2] = 255;
            } else {
              // Make background transparent
              data[i + 3] = 0;
            }
          }

          tempCtx.putImageData(imageData, 0, 0);
          ctx.drawImage(tempCanvas, 0, 0, width, height);
        }
      };
      img.src = answer.canvasData;
    });
  }, [answers, room?.status]);

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>📋 Flipper</h1>
        {room?.roomCode && (
          <div className={styles.roomCode}>Room: {room.roomCode}</div>
        )}
      </div>

      <div className={styles.content}>
        {question && room?.status !== 'ended' && (
          <div className={styles.questionSection}>
            <div className={styles.questionBar}>
              <span className={styles.questionLabel}>Q.</span>
              <span className={styles.questionText}>{question.text}</span>
            </div>
            {question.imageURL && (
              <div className={styles.questionImageWrapper}>
                <img
                  src={question.imageURL}
                  alt="お題の画像"
                  className={styles.questionImage}
                />
              </div>
            )}
          </div>
        )}

        {room?.status === 'ended' && (
          <div className={styles.waitingReveal}>
            <p className={styles.waitingMessage}>放送は終了しました</p>
            <p className={styles.subMessage}>ありがとうございました！</p>
          </div>
        )}

        {(room?.status === 'questioning' || room?.status === 'open') && answers.length > 0 && (
          <div className={styles.answersGrid}>
            {answers.map((answer) => {
              const showContent = room.status === 'open' && answer.isRevealed;

              if (showContent) {
                return (
                  <div
                    key={answer.id}
                    className={`${styles.answerCard} ${answer.isCorrect ? styles.correct : styles.incorrect
                      } ${styles.revealed}`}
                  >
                    <div className={styles.answerHeader}>
                      <span className={styles.answerName}>{answer.displayName}</span>
                      {answer.isCorrect && (
                        <span className={styles.correctBadge}>正解!</span>
                      )}
                    </div>
                    <canvas
                      ref={(el) => {
                        if (el) canvasRefs.current.set(answer.id, el);
                      }}
                      width={320}
                      height={240}
                      className={styles.canvas}
                    />
                  </div>
                );
              } else {
                return (
                  <div key={answer.id} className={styles.hiddenCard}>
                    <div className={styles.hiddenContent}>
                      <span className={styles.hiddenIcon}>?</span>
                    </div>
                    <div className={styles.hiddenName}>{answer.displayName}</div>
                  </div>
                );
              }
            })}
          </div>
        )}

        {room?.status === 'questioning' && answers.length === 0 && (
          <div className={styles.waitingReveal}>
            <p className={styles.waitingMessage}>回答を待っています...</p>
          </div>
        )}

        {!question && (
          <div className={styles.idle}>
            <div className={styles.idleIcon}>📺</div>
            <h2>放送待機中</h2>
            <p>クイズが始まるまでお待ちください</p>
          </div>
        )}
      </div>
    </main>
  );
}
