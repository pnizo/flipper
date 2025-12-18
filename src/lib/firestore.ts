import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  Firestore,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from 'firebase/storage';
import { db, storage } from './firebase';

// Types
export interface Room {
  id: string;
  hostId: string;
  roomCode: string;
  status: 'waiting' | 'questioning' | 'open' | 'ended';
  currentQuestionId: string | null;
  maxParticipants: number;
  createdAt: Timestamp;
}

export interface RoomParticipant {
  id: string;
  roomId: string;
  odId: string;
  displayName: string;
  photoURL: string | null;
  status: 'pending' | 'approved' | 'rejected';
  joinedAt: Timestamp;
}

export interface Question {
  id: string;
  roomId: string;
  text: string;
  imageURL: string | null;
  createdAt: Timestamp;
}

export interface Answer {
  id: string;
  questionId: string;
  odId: string;
  displayName: string;
  canvasData: string; // base64
  isCorrect: boolean;
  isRevealed: boolean;
  updatedAt: Timestamp;
}

// Helper to ensure db is configured
function getDb(): Firestore {
  if (!db) {
    throw new Error('Firebase is not configured. Please set up environment variables.');
  }
  return db;
}

function getStorageInstance(): FirebaseStorage {
  if (!storage) {
    throw new Error('Firebase Storage is not configured. Please set up environment variables.');
  }
  return storage;
}

// Generate random 6-character room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Room functions
export async function createRoom(hostId: string, maxParticipants: number = 100): Promise<Room> {
  const database = getDb();
  const roomCode = generateRoomCode();
  const roomRef = await addDoc(collection(database, 'rooms'), {
    hostId,
    roomCode,
    status: 'waiting',
    currentQuestionId: null,
    maxParticipants,
    createdAt: serverTimestamp(),
  });

  const roomDoc = await getDoc(roomRef);
  return { id: roomRef.id, ...roomDoc.data() } as Room;
}

export async function getRoomByCode(roomCode: string): Promise<Room | null> {
  const database = getDb();
  const q = query(collection(database, 'rooms'), where('roomCode', '==', roomCode.toUpperCase()));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as Room;
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const database = getDb();
  const roomDoc = await getDoc(doc(database, 'rooms', roomId));
  if (!roomDoc.exists()) return null;
  return { id: roomDoc.id, ...roomDoc.data() } as Room;
}

export async function updateRoomStatus(roomId: string, status: Room['status']): Promise<void> {
  const database = getDb();
  await updateDoc(doc(database, 'rooms', roomId), { status });
}

export async function resetRoomToWaiting(roomId: string): Promise<void> {
  const database = getDb();
  await updateDoc(doc(database, 'rooms', roomId), {
    status: 'waiting',
    currentQuestionId: null,
  });
}

// Maximum number of participants allowed
export const MAX_PARTICIPANTS = 15;

// Banned user type
export interface BannedUser {
  odId: string;
  displayName: string;
  photoURL: string | null;
  bannedAt: Timestamp;
}

// Check if user is banned from room
export async function isUserBanned(roomId: string, odId: string): Promise<boolean> {
  const database = getDb();
  const q = query(
    collection(database, 'rooms', roomId, 'bannedUsers'),
    where('odId', '==', odId)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

export async function endRoom(roomId: string): Promise<void> {
  const database = getDb();
  await updateDoc(doc(database, 'rooms', roomId), { status: 'ended' });
}

// Get banned users list
export async function getBannedUsers(roomId: string): Promise<BannedUser[]> {
  const database = getDb();
  const snapshot = await getDocs(collection(database, 'rooms', roomId, 'bannedUsers'));
  return snapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
  })) as BannedUser[];
}

// Subscribe to banned users
export function subscribeToBannedUsers(
  roomId: string,
  callback: (bannedUsers: BannedUser[]) => void
): () => void {
  const database = getDb();
  const q = collection(database, 'rooms', roomId, 'bannedUsers');
  return onSnapshot(q, (snapshot) => {
    const bannedUsers = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
    })) as BannedUser[];
    callback(bannedUsers);
  });
}

// Participant functions - Free join (no approval needed)
export async function requestJoinRoom(
  roomId: string,
  odId: string,
  displayName: string,
  photoURL: string | null
): Promise<RoomParticipant> {
  const database = getDb();

  // Check if banned
  const banned = await isUserBanned(roomId, odId);
  if (banned) {
    throw new Error('このルームから退室させられています');
  }

  // Check if already a participant
  const existingQ = query(
    collection(database, 'rooms', roomId, 'participants'),
    where('odId', '==', odId)
  );
  const existingSnapshot = await getDocs(existingQ);
  if (!existingSnapshot.empty) {
    const existingDoc = existingSnapshot.docs[0];
    return { id: existingDoc.id, ...existingDoc.data() } as RoomParticipant;
  }

  // Check participant count
  const allParticipantsSnapshot = await getDocs(
    collection(database, 'rooms', roomId, 'participants')
  );
  const activeCount = allParticipantsSnapshot.docs.length;

  // Get room to check maxParticipants
  const roomDoc = await getDoc(doc(database, 'rooms', roomId));
  const roomData = roomDoc.data();
  const maxParticipants = roomData?.maxParticipants || MAX_PARTICIPANTS;

  if (activeCount >= maxParticipants) {
    throw new Error(`参加者数が上限(${maxParticipants}人)に達しています`);
  }

  const participantRef = await addDoc(collection(database, 'rooms', roomId, 'participants'), {
    roomId,
    odId,
    displayName,
    photoURL,
    status: 'approved', // Direct approval - no pending state
    joinedAt: serverTimestamp(),
  });

  const participantDoc = await getDoc(participantRef);
  return { id: participantRef.id, ...participantDoc.data() } as RoomParticipant;
}

// Kick a participant and add to ban list
export async function kickParticipant(
  roomId: string,
  participantId: string,
  odId: string,
  displayName: string,
  photoURL: string | null
): Promise<void> {
  const database = getDb();

  // Add to banned users
  await addDoc(collection(database, 'rooms', roomId, 'bannedUsers'), {
    odId,
    displayName,
    photoURL,
    bannedAt: serverTimestamp(),
  });

  // Remove from participants
  await deleteDoc(doc(database, 'rooms', roomId, 'participants', participantId));
}

// Unban a user (remove from ban list)
export async function unbanUser(roomId: string, odId: string): Promise<void> {
  const database = getDb();
  const q = query(
    collection(database, 'rooms', roomId, 'bannedUsers'),
    where('odId', '==', odId)
  );
  const snapshot = await getDocs(q);

  for (const docSnap of snapshot.docs) {
    await deleteDoc(doc(database, 'rooms', roomId, 'bannedUsers', docSnap.id));
  }
}

// Legacy function - kept for compatibility
export async function updateParticipantStatus(
  roomId: string,
  participantId: string,
  status: RoomParticipant['status']
): Promise<void> {
  const database = getDb();
  await updateDoc(doc(database, 'rooms', roomId, 'participants', participantId), { status });
}

export function subscribeToParticipants(
  roomId: string,
  callback: (participants: RoomParticipant[]) => void
): () => void {
  const database = getDb();
  const q = collection(database, 'rooms', roomId, 'participants');
  return onSnapshot(q, (snapshot) => {
    const participants = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as RoomParticipant[];
    callback(participants);
  });
}

export async function getMyParticipation(
  roomId: string,
  odId: string
): Promise<RoomParticipant | null> {
  const database = getDb();
  const q = query(
    collection(database, 'rooms', roomId, 'participants'),
    where('odId', '==', odId)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as RoomParticipant;
}

export function subscribeToMyParticipation(
  roomId: string,
  odId: string,
  callback: (participation: RoomParticipant | null) => void
): () => void {
  const database = getDb();
  const q = query(
    collection(database, 'rooms', roomId, 'participants'),
    where('odId', '==', odId)
  );

  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(null);
      return;
    }
    const docSnap = snapshot.docs[0];
    callback({ id: docSnap.id, ...docSnap.data() } as RoomParticipant);
  });
}

// Question functions
export async function createQuestion(
  roomId: string,
  text: string,
  imageFile: File | null
): Promise<Question> {
  const database = getDb();
  let imageURL: string | null = null;

  if (imageFile) {
    const storageInstance = getStorageInstance();
    const imageRef = ref(storageInstance, `rooms/${roomId}/questions/${Date.now()}_${imageFile.name}`);
    await uploadBytes(imageRef, imageFile);
    imageURL = await getDownloadURL(imageRef);
  }

  const questionRef = await addDoc(collection(database, 'rooms', roomId, 'questions'), {
    roomId,
    text,
    imageURL,
    createdAt: serverTimestamp(),
  });

  // Set as current question
  await updateDoc(doc(database, 'rooms', roomId), {
    currentQuestionId: questionRef.id,
    status: 'questioning',
  });

  const questionDoc = await getDoc(questionRef);
  return { id: questionRef.id, ...questionDoc.data() } as Question;
}

export async function getQuestion(roomId: string, questionId: string): Promise<Question | null> {
  const database = getDb();
  const questionDoc = await getDoc(doc(database, 'rooms', roomId, 'questions', questionId));
  if (!questionDoc.exists()) return null;
  return { id: questionDoc.id, ...questionDoc.data() } as Question;
}

export function subscribeToRoom(roomId: string, callback: (room: Room | null) => void): () => void {
  const database = getDb();
  return onSnapshot(doc(database, 'rooms', roomId), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    callback({ id: snapshot.id, ...snapshot.data() } as Room);
  });
}

// Answer functions
export async function submitAnswer(
  roomId: string,
  questionId: string,
  odId: string,
  displayName: string,
  canvasData: string
): Promise<Answer> {
  const database = getDb();
  // Check if answer already exists
  const q = query(
    collection(database, 'rooms', roomId, 'answers'),
    where('questionId', '==', questionId),
    where('odId', '==', odId)
  );
  const existingAnswers = await getDocs(q);

  if (!existingAnswers.empty) {
    // Update existing answer
    const existingDoc = existingAnswers.docs[0];
    await updateDoc(doc(database, 'rooms', roomId, 'answers', existingDoc.id), {
      canvasData,
      updatedAt: serverTimestamp(),
    });
    const updatedDoc = await getDoc(doc(database, 'rooms', roomId, 'answers', existingDoc.id));
    return { id: existingDoc.id, ...updatedDoc.data() } as Answer;
  }

  // Create new answer
  const answerRef = await addDoc(collection(database, 'rooms', roomId, 'answers'), {
    questionId,
    odId,
    displayName,
    canvasData,
    isCorrect: false,
    isRevealed: false,
    updatedAt: serverTimestamp(),
  });

  const answerDoc = await getDoc(answerRef);
  return { id: answerRef.id, ...answerDoc.data() } as Answer;
}

export async function toggleAnswerCorrect(
  roomId: string,
  answerId: string,
  isCorrect: boolean
): Promise<void> {
  const database = getDb();
  await updateDoc(doc(database, 'rooms', roomId, 'answers', answerId), { isCorrect });
}

export async function toggleAnswerReveal(
  roomId: string,
  answerId: string,
  isRevealed: boolean
): Promise<void> {
  const database = getDb();
  await updateDoc(doc(database, 'rooms', roomId, 'answers', answerId), { isRevealed });
}

export async function revealAllAnswers(roomId: string, questionId: string): Promise<void> {
  const database = getDb();
  const q = query(
    collection(database, 'rooms', roomId, 'answers'),
    where('questionId', '==', questionId)
  );
  const snapshot = await getDocs(q);

  const updates = snapshot.docs.map(docSnap =>
    updateDoc(doc(database, 'rooms', roomId, 'answers', docSnap.id), { isRevealed: true })
  );
  await Promise.all(updates);
}

export function subscribeToAnswers(
  roomId: string,
  questionId: string,
  callback: (answers: Answer[]) => void
): () => void {
  const database = getDb();
  const q = query(
    collection(database, 'rooms', roomId, 'answers'),
    where('questionId', '==', questionId)
  );

  return onSnapshot(q, (snapshot) => {
    const answers = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as Answer[];
    callback(answers);
  });
}

export async function getAnswersForQuestion(
  roomId: string,
  questionId: string
): Promise<Answer[]> {
  const database = getDb();
  const q = query(
    collection(database, 'rooms', roomId, 'answers'),
    where('questionId', '==', questionId)
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as Answer[];
}

// Open answers (reveal all)
export async function openAnswers(roomId: string): Promise<void> {
  const database = getDb();
  await updateDoc(doc(database, 'rooms', roomId), { status: 'open' });
}

// Game Result types for history
export interface GameResultAnswer {
  odId: string;
  displayName: string;
  photoURL: string | null;
  imageURL: string; // Saved to storage
  isCorrect: boolean;
}

export interface GameResult {
  id: string;
  roomId: string;
  roomCode: string;
  hostId: string;
  questionText: string;
  questionImageURL: string | null;
  answers: GameResultAnswer[];
  createdAt: Timestamp;
}

// Convert base64 to Blob for upload
function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
}

// Save game result to history
export async function saveGameResult(
  roomId: string,
  roomCode: string,
  hostId: string,
  question: Question,
  answers: Answer[]
): Promise<GameResult> {
  const database = getDb();
  const storageInstance = getStorageInstance();

  // Upload each answer's canvas to storage
  const savedAnswers: GameResultAnswer[] = await Promise.all(
    answers.map(async (answer) => {
      const blob = base64ToBlob(answer.canvasData);
      const fileName = `history/${roomId}/${question.id}/${answer.odId}_${Date.now()}.png`;
      const imageRef = ref(storageInstance, fileName);
      await uploadBytes(imageRef, blob);
      const imageURL = await getDownloadURL(imageRef);

      return {
        odId: answer.odId,
        displayName: answer.displayName,
        photoURL: null, // Will be populated from participants if needed
        imageURL,
        isCorrect: answer.isCorrect,
      };
    })
  );

  const resultRef = await addDoc(collection(database, 'gameResults'), {
    roomId,
    roomCode,
    hostId,
    questionText: question.text,
    questionImageURL: question.imageURL,
    answers: savedAnswers,
    createdAt: serverTimestamp(),
  });

  const resultDoc = await getDoc(resultRef);
  return { id: resultRef.id, ...resultDoc.data() } as GameResult;
}

// Get game history for a user (as host)
export async function getGameHistory(hostId: string): Promise<GameResult[]> {
  const database = getDb();
  const q = query(
    collection(database, 'gameResults'),
    where('hostId', '==', hostId)
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as GameResult[];
}

// Get a single game result
export async function getGameResult(resultId: string): Promise<GameResult | null> {
  const database = getDb();
  const resultDoc = await getDoc(doc(database, 'gameResults', resultId));
  if (!resultDoc.exists()) return null;
  return { id: resultDoc.id, ...resultDoc.data() } as GameResult;
}
