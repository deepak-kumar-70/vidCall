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
      setTimeout(assignStream, 100);
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
   <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-black text-white h-screen w-full flex justify-center items-center p-4 overflow-auto font-sans">
  {!user ? (
    <div className="bg-slate-800 p-6 rounded-xl w-full max-w-sm space-y-5 shadow-lg border border-slate-700">
      <h1 className="text-3xl font-bold text-center text-blue-400">🎥 Join VidCall</h1>
      <input
        type="text"
        placeholder="Enter your name"
        className="w-full px-4 py-2 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        onClick={joinRoom}
        className="w-full bg-blue-600 py-2 rounded-lg text-white font-semibold hover:bg-blue-700 transition"
      >
        Join Now
      </button>
    </div>
  ) : (
    <div className="w-full max-w-4xl space-y-4">
      {/* Incoming Call UI */}
      {incomingCall && !isCallStarted && (
        <div className="bg-slate-800 p-4 rounded-xl flex justify-between items-center shadow border border-slate-700">
          <span className="text-lg">
            📞 <strong>{incomingCall.from}</strong> is calling...
          </span>
          <div className="flex gap-2">
            <button
              onClick={acceptCall}
              className="bg-green-600 px-4 py-2 rounded-full text-white flex items-center gap-2 hover:bg-green-700"
            >
              <IoCallSharp /> Accept
            </button>
            <button
              onClick={rejectCall}
              className="bg-red-600 px-4 py-2 rounded-full text-white flex items-center gap-2 hover:bg-red-700"
            >
              <IoClose /> Reject
            </button>
          </div>
        </div>
      )}

      {/* Call UI */}
      {isCallStarted ? (
        <div className="space-y-4">
          <p className="text-center text-slate-400">Call Time: {formatTime(callTime)}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center justify-center">
            <div className="relative border-2 border-blue-700 rounded-2xl overflow-hidden shadow-lg aspect-video bg-black">
              <video
                ref={localVideo}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-2 left-2 text-xs bg-blue-600 px-2 py-0.5 rounded text-white">You</span>
            </div>
            <div className="relative border-2 border-green-700 rounded-2xl overflow-hidden shadow-lg aspect-video bg-black">
              <video
                ref={remoteVideo}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-2 left-2 text-xs bg-green-600 px-2 py-0.5 rounded text-white">{remoteName.current}</span>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={endCall}
              className="mt-4 bg-red-600 hover:bg-red-700 transition px-6 py-2 text-white rounded-full shadow-lg"
            >
              End Call
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-xl font-bold text-blue-400">👥 Online Users</h2>
          <div className="max-h-64 overflow-y-auto space-y-2 custom-scroll">
            {allUsers.map((u, i) => (
              <div
                key={i}
                className="bg-slate-800 p-3 rounded-lg flex justify-between items-center border border-slate-700 shadow"
              >
                <span className="text-white">{u.name}</span>
                <button
                  onClick={() => callUser(u.name)}
                  className="text-green-500 text-2xl hover:text-green-400"
                  title="Call"
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