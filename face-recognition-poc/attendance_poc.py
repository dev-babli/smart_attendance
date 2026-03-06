#!/usr/bin/env python3
"""
Smart School Attendance - Face Recognition PoC
==============================================
Simulates: Webcam/RTSP → Face Detection → Match against Known Faces → Log Attendance + WhatsApp

Usage:
  1. Create folder: known_faces/
  2. Add photos: known_faces/John_Doe.jpg, known_faces/Jane_Smith.jpg (filename = person name)
  3. Run: python attendance_poc.py

Press 'q' to quit.
"""

import csv
import json
import os
import time
import threading
from datetime import datetime
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

import cv2
import numpy as np
import requests

# ============== CONFIGURATION ==============
POC_DIR = Path(__file__).parent
KNOWN_FACES_DIR = POC_DIR / "known_faces"
STUDENTS_CSV = POC_DIR / "students.csv"
TARGET_FPS = 4  # Process 4 frames per second (reduce CPU load)
# Heuristic similarity threshold for simple embedding matcher (0..1, higher = stricter)
CONFIDENCE_THRESHOLD = 0.6
COOLDOWN_SECONDS = 30  # Debounce: don't re-log same person within 30 seconds

# API: Next.js attendance-event endpoint (ensure dev server is running)
API_BASE_URL = os.environ.get("ATTENDANCE_API_URL", "http://localhost:3000")
API_KEY = os.environ.get("ATTENDANCE_API_KEY", "")


def _api_headers():
    """Headers for API requests. Include X-API-Key when ATTENDANCE_API_KEY is set."""
    h = {"Content-Type": "application/json"}
    if API_KEY:
        h["X-API-Key"] = API_KEY
    return h


def fetch_camera_config() -> str | int | None:
    """Fetch video_source from API. Returns None on failure or if not set."""
    try:
        r = requests.get(
            f"{API_BASE_URL}/api/camera-config",
            headers=_api_headers(),
            timeout=5,
        )
        if not r.ok:
            return None
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        vs = data.get("video_source")
        if vs is None or (isinstance(vs, str) and not vs.strip()):
            return None
        s = str(vs).strip()
        if s == "0":
            return 0
        if s.startswith("rtsp://") or s.startswith("http://") or s.startswith("https://"):
            return s
        return None
    except Exception:
        return None

# Video: 0 = webcam, or DroidCam/IP URL (set by env or prompt at start)
DEFAULT_CAM_IP = "192.168.29.224"
DEFAULT_CAM_PORT = "4747"
DEFAULT_STREAM_PORT = 5000  # Dashboard Live Feed and Face Scan use this
VIDEO_SOURCE = None  # set in main() after prompt or from env
STREAM_PORT = DEFAULT_STREAM_PORT

# Shared latest frame for MJPEG (dashboard + Face Scan use this same camera)
_latest_frame = None
_frame_lock = threading.Lock()
_stream_ready = False

# ============== GLOBALS ==============
last_attendance = {}  # {name: timestamp} for debouncing
last_unknown_report = 0  # Debounce unknown face reports
UNKNOWN_REPORT_COOLDOWN = 10  # Seconds between unknown face reports
last_auto_enroll_time = 0  # Debounce auto-enroll (same unknown face)
AUTO_ENROLL_COOLDOWN = 10  # Seconds between auto-enrolling new faces
last_frame_time = 0
frame_interval = 1.0 / TARGET_FPS
students_map = {}  # {name: {phone, tenant_id}}
MIN_ENROLL_FACE_SIZE = 60  # Minimum width/height for auto-enroll crop
MIN_ENROLL_SHARPNESS = 50  # Laplacian variance (lower = allow more blur)


def load_students():
    """Load student name -> phone mapping from students.csv."""
    global students_map
    students_map = {}
    if not STUDENTS_CSV.exists():
        print(f"[WARN] {STUDENTS_CSV} not found. WhatsApp API calls will use demo phone.")
        return
    with open(STUDENTS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("name", "").strip()
            if name:
                students_map[name] = {
                    "phone": row.get("phone", "").strip() or "916371070959",
                    "tenant_id": row.get("tenant_id", "").strip() or "delhi",
                }


def load_known_faces():
    """Load known face images from known_faces/ folder. Returns list of (name, image_path)."""
    known = []
    if not KNOWN_FACES_DIR.exists():
        KNOWN_FACES_DIR.mkdir(parents=True, exist_ok=True)
        return known
    for path in KNOWN_FACES_DIR.glob("*"):
        if path.suffix.lower() in (".jpg", ".jpeg", ".png", ".bmp"):
            name = path.stem.replace("_", " ")  # John_Doe.jpg -> John Doe
            known.append((name, str(path)))
    return known


def _get_next_student_id() -> int:
    """Return next available student_id from students.csv."""
    if not STUDENTS_CSV.exists():
        return 1
    ids = []
    with open(STUDENTS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                ids.append(int(row.get("student_id") or 0))
            except ValueError:
                pass
    return max(ids, default=0) + 1


def _face_quality_ok(crop) -> bool:
    """Quick check: size and sharpness suitable for enrollment."""
    if crop is None or crop.size == 0:
        return False
    h, w = crop.shape[:2]
    if w < MIN_ENROLL_FACE_SIZE or h < MIN_ENROLL_FACE_SIZE:
        return False
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    return lap.var() >= MIN_ENROLL_SHARPNESS


def auto_enroll_unknown_face(face_crop, known_faces_list: list) -> str | None:
    """
    Enroll an unknown face: analyse, save to known_faces/, add to students.csv,
    append to known_faces_list, and mark attendance. Returns enrolled name or None.
    """
    global last_auto_enroll_time, students_map
    now = time.time()
    if now - last_auto_enroll_time < AUTO_ENROLL_COOLDOWN:
        return None
    if face_crop is None or not _face_quality_ok(face_crop):
        return None
    try:
        from enroll_face import add_to_students_csv
    except ImportError:
        return None
    next_id = _get_next_student_id()
    name = f"Guest_{next_id}"
    file_name = name.replace(" ", "_") + ".jpg"
    out_path = KNOWN_FACES_DIR / file_name
    KNOWN_FACES_DIR.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), face_crop)
    add_to_students_csv(name, student_id=next_id)
    load_students()
    known_faces_list.append((name, str(out_path)))
    last_auto_enroll_time = now
    print(f"\n>>> AUTO-ENROLLED: {name} (student_id={next_id}) — face analysed and added.")
    log_attendance(name, 1.0)
    return name


known_embeddings_cache: dict[str, np.ndarray] = {}
_use_face_recognition = False

try:
    import face_recognition
    _use_face_recognition = True
except ImportError:
    pass


def _face_embedding(img: np.ndarray) -> np.ndarray:
    """Simple embedding: resized grayscale + L2-normalized vector (fallback when face_recognition not available)."""
    if img is None or img.size == 0:
        return np.zeros((1,), dtype="float32")
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
    gray = cv2.resize(gray, (112, 112))
    vec = gray.astype("float32").flatten()
    norm = np.linalg.norm(vec) + 1e-6
    return vec / norm


def _face_embedding_fr(img: np.ndarray) -> np.ndarray | None:
    """face_recognition 128-d encoding. Returns None if no face detected."""
    if img is None or img.size == 0:
        return None
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    encodings = face_recognition.face_encodings(rgb)
    return encodings[0] if encodings else None


def find_match(frame, known_faces):
    """
    Detect faces in frame and compare against known faces.
    Uses face_recognition (128-d) when available, else OpenCV grayscale embedding.
    Returns (matched_name, confidence, unknown_face_crop).
    """
    try:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    except Exception:
        return None, 0.0, None

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    if cascade.empty():
        return None, 0.0, None

    faces = cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=6, minSize=(60, 60))
    if len(faces) == 0:
        return None, 0.0, None

    x, y, w, h = max(faces, key=lambda r: r[2] * r[3])
    face_crop = frame[y : y + h, x : x + w].copy()

    if _use_face_recognition:
        face_emb = _face_embedding_fr(face_crop)
        if face_emb is not None:
            known_names = []
            known_encodings = []
            for name, ref_path in known_faces:
                try:
                    cache_key = f"fr:{ref_path}"
                    enc = known_embeddings_cache.get(cache_key)
                    if enc is None:
                        img = cv2.imread(ref_path)
                        if img is None:
                            continue
                        enc = _face_embedding_fr(img)
                        if enc is not None:
                            known_embeddings_cache[cache_key] = enc
                    if enc is not None:
                        known_names.append(name)
                        known_encodings.append(enc)
                except Exception:
                    continue
            if known_encodings:
                matches = face_recognition.compare_faces(
                    known_encodings, face_emb, tolerance=1.0 - CONFIDENCE_THRESHOLD
                )
                distances = face_recognition.face_distance(known_encodings, face_emb)
                best_idx = np.argmin(distances) if len(distances) > 0 else -1
                if best_idx >= 0 and matches[best_idx]:
                    conf = max(0.0, 1.0 - float(distances[best_idx]))
                    return known_names[best_idx], conf, None

    # Fallback: OpenCV grayscale embedding
    face_emb = _face_embedding(face_crop)
    best_name = None
    best_score = 0.0

    for name, ref_path in known_faces:
        try:
            cache_key = f"cv:{ref_path}"
            emb = known_embeddings_cache.get(cache_key)
            if emb is None:
                img = cv2.imread(ref_path)
                if img is None:
                    continue
                emb = _face_embedding(img)
                known_embeddings_cache[cache_key] = emb
            dist = float(np.linalg.norm(face_emb - emb))
            score = max(0.0, 1.0 - dist)
            if score > best_score:
                best_score = score
                best_name = name
        except Exception:
            continue

    if best_name and best_score >= CONFIDENCE_THRESHOLD:
        return best_name, best_score, None
    return None, 0.0, face_crop


def should_log_attendance(name: str) -> bool:
    """Debounce: only log if cooldown has passed."""
    now = time.time()
    if name not in last_attendance:
        return True
    return (now - last_attendance[name]) >= COOLDOWN_SECONDS


def report_unknown_face(face_crop) -> bool:
    """POST unknown face to API for manual assignment. Returns True if sent."""
    global last_unknown_report
    now = time.time()
    if now - last_unknown_report < UNKNOWN_REPORT_COOLDOWN:
        return False
    if face_crop is None:
        return False
    try:
        import base64
        _, buf = cv2.imencode(".jpg", face_crop)
        b64 = base64.b64encode(buf).decode("utf-8")
        r = requests.post(
            f"{API_BASE_URL}/api/unknown-faces",
            json={"image_base64": b64, "camera_id": "webcam"},
            headers=_api_headers(),
            timeout=5,
        )
        if r.ok:
            last_unknown_report = now
            print(">>> Unknown face reported for manual assignment.")
            return True
    except Exception as e:
        pass
    return False


def log_attendance(name: str, confidence: float):
    """Log attendance and trigger WhatsApp via API."""
    last_attendance[name] = time.time()
    info = students_map.get(name, {"phone": "916371070959", "tenant_id": "delhi"})
    phone = info["phone"]
    tenant_id = info["tenant_id"]
    time_str = datetime.now().strftime("%I:%M %p")

    print(f"\n>>> ATTENDANCE MARKED: {name} (confidence: {confidence:.2%})")
    print(">>> Triggering WhatsApp API...")

    try:
        r = requests.post(
            f"{API_BASE_URL}/api/attendance-event",
            json={
                "student_name": name,
                "phone": phone,
                "time": time_str,
                "tenant_id": tenant_id,
            },
            headers=_api_headers(),
            timeout=10,
        )
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.ok:
            print(f">>> OK: {data.get('status', 'sent')}")
        else:
            print(f">>> FAIL: {data.get('error', r.text)}")
    except requests.exceptions.RequestException as e:
        print(f">>> API ERROR: {e}")


def resolve_video_source_at_startup() -> bool:
    """
    Resolve VIDEO_SOURCE at startup. Priority: API > env > camera_config.json > prompt.
    Returns True if resolved, False if we need to prompt (local only).
    """
    global VIDEO_SOURCE, STREAM_PORT

    # 1. Try API (when ATTENDANCE_API_URL points to Vercel)
    if API_BASE_URL and not API_BASE_URL.startswith("http://localhost"):
        vs = fetch_camera_config()
        if vs is not None:
            VIDEO_SOURCE = vs
            STREAM_PORT = int(os.environ.get("STREAM_PORT", str(DEFAULT_STREAM_PORT)))
            return True

    # 2. Env VIDEO_SOURCE
    vs = os.environ.get("VIDEO_SOURCE")
    if vs is not None and str(vs).strip():
        VIDEO_SOURCE = int(vs) if str(vs).strip().isdigit() else str(vs).strip()
        STREAM_PORT = int(os.environ.get("STREAM_PORT", str(DEFAULT_STREAM_PORT)))
        return True

    # 3. camera_config.json (local)
    try:
        from camera_config import load_camera_config, prompt_camera_config as shared_prompt
        vs, sp = load_camera_config()
        if vs is not None and sp is not None:
            VIDEO_SOURCE = vs
            STREAM_PORT = sp
            return True
        if os.environ.get("HEADLESS", "").lower() in ("1", "true", "yes"):
            # Headless (Render): no interactive prompt, must have env or API
            print("HEADLESS: No camera config from API/env. Set VIDEO_SOURCE or save from dashboard.")
            return False
        VIDEO_SOURCE, STREAM_PORT = shared_prompt(ask_stream_port=True)
        return True
    except ImportError:
        pass

    # 4. Interactive prompt (local only)
    print("Camera source (DroidCam / IP webcam, or webcam)")
    ip = input(f"  IP address (or 0 for webcam) [{DEFAULT_CAM_IP}]: ").strip() or DEFAULT_CAM_IP
    if ip == "0" or ip.lower() == "webcam":
        VIDEO_SOURCE = 0
    else:
        port = input(f"  Port [{DEFAULT_CAM_PORT}]: ").strip() or DEFAULT_CAM_PORT
        VIDEO_SOURCE = f"http://{ip}:{port}/video"
    STREAM_PORT = int(input(f"  Stream port [{DEFAULT_STREAM_PORT}]: ").strip() or str(DEFAULT_STREAM_PORT))
    return True


def prompt_camera_config():
    """Use shared camera config (same as enroll_face, stream_server). Calls resolve_video_source_at_startup."""
    if not resolve_video_source_at_startup():
        raise SystemExit(1)


def _students_json() -> bytes:
    """Return students from students.csv as JSON."""
    students = []
    if STUDENTS_CSV.exists():
        try:
            with open(STUDENTS_CSV, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for i, row in enumerate(reader):
                    name = (row.get("name") or "").strip()
                    if name:
                        students.append({
                            "id": row.get("student_id", str(i + 1)).strip(),
                            "name": name,
                            "phone": (row.get("phone") or "").strip(),
                            "tenant_id": (row.get("tenant_id") or "delhi").strip(),
                        })
        except Exception:
            pass
    return json.dumps({"students": students}).encode("utf-8")


class _StreamHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path in ("/", "/stream"):
            self._send_stream()
        elif self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        elif self.path == "/students":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(_students_json())
        else:
            self.send_error(404)

    def _send_stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        try:
            while True:
                with _frame_lock:
                    frame = _latest_frame
                if frame is None:
                    time.sleep(0.05)
                    continue
                _, jpg = cv2.imencode(".jpg", frame)
                self.wfile.write(b"--frame\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(jpg)}\r\n".encode())
                self.wfile.write(b"\r\n")
                self.wfile.write(jpg.tobytes())
                self.wfile.write(b"\r\n")
                time.sleep(0.05)
        except (BrokenPipeError, ConnectionResetError):
            pass


def _run_stream_server():
    server = HTTPServer(("0.0.0.0", STREAM_PORT), _StreamHandler)
    try:
        server.serve_forever()
    except Exception:
        pass
    finally:
        server.shutdown()


def main():
    global VIDEO_SOURCE, _latest_frame, _stream_ready
    _headless = os.environ.get("HEADLESS", "").lower() in ("1", "true", "yes")
    prompt_camera_config()
    load_students()
    known_faces = load_known_faces()
    if not known_faces:
        print("No known faces found. Add images to known_faces/ and run again.")
        return

    print(f"Loaded {len(known_faces)} known faces: {[n for n, _ in known_faces]}" + (" (face_recognition)" if _use_face_recognition else " (OpenCV fallback)"))
    print(f"Students: {len(students_map)} | API: {API_BASE_URL}")
    print(f"Video: {VIDEO_SOURCE}")
    print(f"Target FPS: {TARGET_FPS} | Confidence: {CONFIDENCE_THRESHOLD} | Cooldown: {COOLDOWN_SECONDS}s")
    print("Press 'q' to quit.\n")

    cap = cv2.VideoCapture(VIDEO_SOURCE)
    for _ in range(2):
        if cap.isOpened():
            break
        cap.release()
        time.sleep(2)
        cap = cv2.VideoCapture(VIDEO_SOURCE)
    if not cap.isOpened():
        print("Failed to open video source.")
        print("  Tips: DroidCam app on + same Wi‑Fi; or run again and enter 0 for webcam. Edit camera_config.json to change.")
        return

    # Serve same feed to dashboard (Live Feed + Face Scan use this)
    thread = threading.Thread(target=_run_stream_server, daemon=True)
    thread.start()
    print(f"Dashboard feed: http://localhost:{STREAM_PORT}/stream (Live Feed & Face Scan use this camera)")

    global last_frame_time
    last_frame_time = 0
    last_config_check = 0.0
    config_check_interval = 60.0  # seconds
    last_fetched_url: str | int | None = VIDEO_SOURCE
    use_api_config = bool(API_BASE_URL and not API_BASE_URL.startswith("http://localhost"))

    while True:
        now = time.time()

        # Hot-switch: fetch camera config from API every 60s
        if use_api_config and (now - last_config_check) >= config_check_interval:
            last_config_check = now
            new_vs = fetch_camera_config()
            if new_vs is not None and new_vs != last_fetched_url:
                norm = (0 if new_vs == 0 else str(new_vs))
                old_norm = (0 if last_fetched_url == 0 else str(last_fetched_url))
                if norm != old_norm:
                    print(f"\n>>> Camera URL changed, reconnecting: {new_vs}")
                    cap.release()
                    for attempt in range(3):
                        cap = cv2.VideoCapture(new_vs)
                        if cap.isOpened():
                            last_fetched_url = new_vs
                            print(">>> Reconnected successfully.")
                            break
                        cap.release()
                        time.sleep(2)
                    else:
                        print(">>> Reconnect failed, keeping previous source.")
                        cap = cv2.VideoCapture(last_fetched_url if last_fetched_url is not None else VIDEO_SOURCE)

        ret, frame = cap.read()
        if not ret:
            break

        if now - last_frame_time < frame_interval:
            cap.grab()  # Skip frame
            continue
        last_frame_time = now

        # Flip for webcam mirror effect (optional)
        frame = cv2.flip(frame, 1)

        name, confidence, unknown_crop = find_match(frame, known_faces)

        if name and confidence >= CONFIDENCE_THRESHOLD:
            if should_log_attendance(name):
                log_attendance(name, confidence)
            # Draw label on frame
            cv2.putText(
                frame, f"{name} ({confidence:.0%})",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2
            )
        else:
            enrolled_name = None
            if unknown_crop is not None:
                enrolled_name = auto_enroll_unknown_face(unknown_crop, known_faces)
                if enrolled_name is None:
                    report_unknown_face(unknown_crop)  # fallback: report to API if no auto-enroll
            if enrolled_name:
                cv2.putText(frame, f"Enrolled: {enrolled_name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
            else:
                cv2.putText(frame, "Unknown (not registered)", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        # Serve this frame to dashboard (Live Feed + Face Scan)
        with _frame_lock:
            _latest_frame = frame.copy()
            _stream_ready = True

        # Skip GUI on headless (Render, cloud servers)
        if not _headless:
            cv2.imshow("Attendance PoC", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    if not _headless:
        cv2.destroyAllWindows()
    print("Done.")


if __name__ == "__main__":
    main()
