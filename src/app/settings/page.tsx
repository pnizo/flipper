'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import styles from './page.module.css';

export default function SettingsPage() {
  const { user, userProfile, loading, updateProfile } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !storage) return;

    setIsUploading(true);
    setMessage('');

    try {
      // Upload to Firebase Storage
      const imageRef = ref(storage, `avatars/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(imageRef, file);
      const url = await getDownloadURL(imageRef);
      setPhotoURL(url);
      setMessage('画像をアップロードしました。「設定を保存」を押して確定してください。');
    } catch (err) {
      console.error('Failed to upload image:', err);
      setMessage('画像のアップロードに失敗しました');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    setMessage('');

    try {
      await updateProfile({
        displayName,
        photoURL,
      });
      setMessage('設定を保存しました');
    } catch (err) {
      console.error('Failed to save settings:', err);
      setMessage('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>読み込み中...</div>
      </main>
    );
  }

  if (!user) {
    router.push('/');
    return null;
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <button onClick={() => router.push('/')} className={styles.backButton}>
          ← ホームに戻る
        </button>

        <h1 className={styles.title}>ユーザー設定</h1>

        <div className={styles.form}>
          <div className={styles.avatarSection}>
            {photoURL ? (
              <img src={photoURL} alt="Avatar" className={styles.avatar} />
            ) : (
              <div className={styles.avatarPlaceholder}>?</div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              ref={fileInputRef}
              className={styles.fileInput}
              id="avatarUpload"
            />
            <label htmlFor="avatarUpload" className={styles.uploadButton}>
              {isUploading ? 'アップロード中...' : '📷 画像を選択'}
            </label>
          </div>

          <div className={styles.field}>
            <label htmlFor="displayName">表示名</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="表示名を入力"
              className="input"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="photoURL">アイコンURL（直接入力）</label>
            <input
              id="photoURL"
              type="url"
              value={photoURL}
              onChange={(e) => setPhotoURL(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="input"
            />
            <p className={styles.hint}>
              上の画像選択ボタンでアップロードするか、URLを直接入力できます
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || isUploading}
            className="btn btn-primary"
          >
            {isSaving ? '保存中...' : '設定を保存'}
          </button>

          {message && (
            <div className={message.includes('失敗') ? styles.error : styles.success}>
              {message}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
