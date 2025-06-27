import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { IoCall, IoClose, IoCallSharp } from "react-icons/io5";
import callSound from "./assets/ringtone.mp3";

const socket = io("https://vidcallbackend-1.onrender.com", {
  transports: ["websocket", "polling"], // fallback to polling if WS fails
});


const App = () => {
  const [name, setName] = useState("");
  const [user, setUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [callTime, setCallTime] = useState(0);

  const nameRef = useRef("");
  const remoteName = useRef("");
  const pc = useRef(null);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const localStream = useRef(null);
  const timerRef = useRef(null);
  const ringtone = useRef(new Audio(callSound));

  const joinRoom = () => {
    if (!name.trim()) return;
    socket.emit("join::user", { name });
    nameRef.current = name;
    setUser(name);
  };

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStream.current = stream;

      if (localVideo.current) {
        console.log('hello')
        localVideo.current.srcObject = stream; 
        localVideo.current.muted = true;
        localVideo.current.onloadedmetadata = () => {
          localVideo.current.play();
        };
      }
    } catch (error) {
      console.error("❌ Error accessing media devices:", error);
      alert("Unable to access camera/mic. Check permissions.");
    }
  };

  const createPeerConnection = () => {
    pc.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.current.onicecandidate = (e) => {
      if (e.candidate && remoteName.current) {
        socket.emit("ice-candidate", {
          to: remoteName.current,
          candidate: e.candidate,
        });
      }
    };

 pc.current.ontrack = (e) => {
  console.log("Track event:", e);

  const remoteStream = e.streams?.[0];
  if (!remoteStream) {
    console.warn("No remote stream received");
    return;
  }

  // Assign the stream to the remote video element once it's mounted
  const assignStream = () => {
    if (remoteVideo.current) {
      console.log("✅ Assigning remote stream to video");
      remoteVideo.current.srcObject = remoteStream;
      remoteVideo.current.onloadedmetadata = () => {
        remoteVideo.current.play().catch((err) =>
          console.error("Error playing remote video", err)
        );
      };
    } else {
      setTimeout(assignStream, 100); // retry until the ref is mounted
    }
  };

  assignStream();
};


    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.current.addTrack(track, localStream.current);
      });
    }
  };

  const callUser = async (to) => {
    if (to === nameRef.current || isCallStarted) return;
    setIsCallStarted(true);
    remoteName.current = to;
    await startLocalStream();
    createPeerConnection(to);

    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);
    

    socket.emit("call::offer", {
      to,
      from: nameRef.current,
      offer: pc.current.localDescription,
    });
  };
const acceptCall = async () => {
  ringtone.current.pause();
  ringtone.current.currentTime = 0;

  const { from, offer } = incomingCall;
  remoteName.current = from;
  setIncomingCall(null);

  setIsCallStarted(true); // 👈 set this first so video components mount

  setTimeout(async () => {
    await startLocalStream();
    createPeerConnection(from);

    await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);

    socket.emit("call::answer", {
      to: from,
      from: nameRef.current,
      answer: pc.current.localDescription,
    });

    startCallTimer();
  }, 300); // delay gives React time to render the <video> tags
};


  const rejectCall = () => {
    ringtone.current.pause();
    ringtone.current.currentTime = 0;
    if (incomingCall?.from) {
      socket.emit("call::reject", { to: incomingCall.from });
    }
    setIncomingCall(null);
  };

  const endCall = () => {
    if (remoteName.current) {
      socket.emit("call::end", { to: remoteName.current });
    }
    cleanUpCall();
  };

  const cleanUpCall = () => {
    if (pc.current) pc.current.close();
    pc.current = null;
    remoteName.current = "";

    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }

    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;

    clearInterval(timerRef.current);
    setCallTime(0);
    setIsCallStarted(false);
    setIncomingCall(null);
  };

  const startCallTimer = () => {
    timerRef.current = setInterval(() => {
      setCallTime((prev) => prev + 1);
    }, 1000);
  };

  const formatTime = (seconds) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  useEffect(() => {
    socket.on("user::joined", (data) => {
      const list = Object.values(data).filter((u) => u.name !== nameRef.current);
      setAllUsers(list);
    });

    socket.on("call::offer", ({ from, offer }) => {
      ringtone.current.loop = true;
      ringtone.current.currentTime = 0;
      ringtone.current.play();
      setIncomingCall({ from, offer });
    });

    socket.on("call::answer", async ({ answer }) => {
      if (pc.current) {
        await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
        startCallTimer();
      }
    });

    socket.on("call::reject", () => {
      alert("❌ Call rejected");
      cleanUpCall();
    });

    socket.on("call::end", () => {
      alert("📞 Call ended by remote user");
      cleanUpCall();
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      if (pc.current && candidate) {
        try {
          await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("ICE candidate error", err);
        }
      }
    });

    return () => {
      socket.off("user::joined");
      socket.off("call::offer");
      socket.off("call::answer");
      socket.off("call::reject");
      socket.off("call::end");
      socket.off("ice-candidate");
    };
  }, []);

  return (
    <div className="bg-slate-950 text-white h-screen w-full flex justify-center items-center p-4 overflow-auto">
      {!user ? (
        <div className="bg-slate-800 p-6 rounded w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-bold">🎥 Join VidCall</h1>
          <input
            type="text"
            placeholder="Your name"
            className="w-full p-2 bg-slate-700 rounded"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            onClick={joinRoom}
            className="w-full bg-blue-600 py-2 rounded hover:bg-blue-700"
          >
            Join
          </button>
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-4">
          {incomingCall && !isCallStarted && (
            <div className="bg-slate-800 p-4 rounded flex justify-between items-center">
              <span>
                📞 Incoming call from <strong>{incomingCall.from}</strong>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={acceptCall}
                  className="bg-green-600 px-3 py-1 rounded flex items-center gap-1"
                >
                  <IoCallSharp /> Accept
                </button>
                <button
                  onClick={rejectCall}
                  className="bg-red-600 px-3 py-1 rounded flex items-center gap-1"
                >
                  <IoClose /> Reject
                </button>
              </div>
            </div>
          )}

          {isCallStarted ? (
            <div>
              <p className="text-center text-slate-400 mb-2">
                Call time: {formatTime(callTime)}
              </p>
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <video
                  ref={localVideo}
                  autoPlay
                  playsInline
                  muted
                  className="w-full md:w-1/2 h-40 border rounded bg-black"
                />
                <video
                  ref={remoteVideo}
                  autoPlay
                  playsInline
                  className="w-full md:w-1/2 h-40 border rounded bg-black"
                />
              </div>
              <button
                onClick={endCall}
                className="mt-4 bg-red-600 px-4 py-2 rounded"
              >
                End Call
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold">👥 Online Users</h2>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {allUsers.map((u, i) => (
                  <div
                    key={i}
                    className="bg-slate-800 p-3 rounded flex justify-between items-center"
                  >
                    <span>{u.name}</span>
                    <button
                      onClick={() => callUser(u.name)}
                      className="text-green-500 text-xl"
                    >
                      <IoCall />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default App;