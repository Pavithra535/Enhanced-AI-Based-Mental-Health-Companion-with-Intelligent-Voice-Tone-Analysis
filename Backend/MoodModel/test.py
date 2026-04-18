import cv2
import numpy as np
from keras.models import load_model
from collections import deque

model=load_model('model_file_30epochs.h5')

video=cv2.VideoCapture(0)

faceDetect=cv2.CascadeClassifier('haarcascade_frontalface_default.xml')

labels_dict={0:'Angry',1:'Disgust', 2:'Fear', 3:'Happy',4:'Neutral',5:'Sad',6:'Surprise'}
recent_labels = deque(maxlen=8)
MIN_FACE_SIZE = 80
MIN_CONFIDENCE = 0.40


def preprocess_face(gray_frame, x, y, w, h):
    pad = int(0.12 * max(w, h))
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(gray_frame.shape[1], x + w + pad)
    y1 = min(gray_frame.shape[0], y + h + pad)
    face = gray_frame[y0:y1, x0:x1]

    if face.size == 0:
        return None

    face = cv2.GaussianBlur(face, (3, 3), 0)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    face = clahe.apply(face)
    face = cv2.resize(face, (48, 48), interpolation=cv2.INTER_AREA)
    face = face.astype('float32') / 255.0
    return np.reshape(face, (1, 48, 48, 1))


def majority_label(labels):
    if not labels:
        return None
    counts = {}
    for item in labels:
        counts[item] = counts.get(item, 0) + 1
    return max(counts, key=counts.get)

while True:
    ret,frame=video.read()
    if not ret:
        continue

    gray=cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces= faceDetect.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=6,
        minSize=(MIN_FACE_SIZE, MIN_FACE_SIZE)
    )

    if len(faces) == 0:
        eq = cv2.equalizeHist(gray)
        faces = faceDetect.detectMultiScale(
            eq,
            scaleFactor=1.15,
            minNeighbors=5,
            minSize=(MIN_FACE_SIZE, MIN_FACE_SIZE)
        )

    for x,y,w,h in faces:
        reshaped = preprocess_face(gray, x, y, w, h)
        if reshaped is None:
            continue

        result=model.predict(reshaped, verbose=0)
        label=int(np.argmax(result, axis=1)[0])
        confidence = float(result[0][label])

        if confidence < MIN_CONFIDENCE:
            display_text = 'Low confidence'
            cv2.rectangle(frame, (x,y), (x+w, y+h), (0,165,255), 2)
            cv2.putText(frame, display_text, (x, y-10),cv2.FONT_HERSHEY_SIMPLEX,0.7,(255,255,255),2)
            continue

        recent_labels.append(label)
        stable_label = majority_label(recent_labels)
        if stable_label is None:
            stable_label = label

        display_text = f"{labels_dict[stable_label]} ({confidence*100:.1f}%)"
        print(display_text)

        cv2.rectangle(frame, (x,y), (x+w, y+h), (0,0,255), 1)
        cv2.rectangle(frame,(x,y),(x+w,y+h),(50,50,255),2)
        cv2.rectangle(frame,(x,y-40),(x+w,y),(50,50,255),-1)
        cv2.putText(frame, display_text, (x, y-10),cv2.FONT_HERSHEY_SIMPLEX,0.6,(255,255,255),2)
        
    cv2.imshow("Frame",frame)
    k=cv2.waitKey(1)
    if k==ord('q'):
        break

video.release()
cv2.destroyAllWindows()