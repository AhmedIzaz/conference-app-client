"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { onUserDelete, onUserSet } from "./utils/socket.utils";
import * as mediasoupClient from "mediasoup-client";

const room = "MAIN";
export default function Home() {
  const [inp, setInp] = useState<string>("");
  const [users, setUsers] = useState<string[]>([]);
  const socketRef = useRef<Socket>(null);
  const deviceRef = useRef<mediasoupClient.Device>(null);
  useEffect(() => {
    if (!deviceRef?.current) {
      deviceRef.current = new mediasoupClient.Device();
    }
    const socket = io("http://localhost:8000", {
      transports: ["websocket"],
    });

    socket.on("connect", async () => {
      console.log(
        "Socket from client connected successfully : id = ",
        socket.id
      );
      socketRef.current = socket;

      const isJoined: boolean = await socket.emitWithAck("join-room", room);

      if (isJoined) {
        console.log(
          "Has joined to room:",
          room,
          " Now getting RTP capabilities of conference room router"
        );
        const routerRtpCapabilities: mediasoupClient.types.RtpCapabilities =
          await socket.emitWithAck("get-rtp-capabilities", { room });
        console.log("RTP capability from server: ", routerRtpCapabilities);
        await deviceRef.current?.load({ routerRtpCapabilities });

        const sendTransportsInfo: mediasoupClient.types.TransportOptions =
          await socket.emitWithAck("create-transport", {
            room,
            direction: "SEND",
          });
        console.log(
          "Got send transport info: ",
          sendTransportsInfo,
          " Now creating send transport -> "
        );
        if (sendTransportsInfo?.id) {
          const sendTranport =  deviceRef.current?.createSendTransport(
            sendTransportsInfo
          );
          console.log({ sendTranport });
          sendTranport?.on(
            "connect",
            async ({ dtlsParameters }, cb) => {
              console.log("Hi")
              const isConnectedSendTransport: boolean =
                await socket.emitWithAck("connect-sendTransport", {
                  room,
                  transportId: sendTranport.id,
                  dtlsParameters,
                });
              if (isConnectedSendTransport) {
                console.log(
                  "Send transport connected with server from client side"
                );
                cb();
              } else {
                // errorCb(
                //   new Error(
                //     "Send transport didnot connected with server with DTLS params"
                //   )
                // );
              }
            }
          );
        }
      }

      onUserSet(socket, setUsers);
      onUserDelete(socket, setUsers);
    });

    return () => {
      socket.off();
    };
  }, []);

  const onUserSave = () => {
    if (socketRef.current) {
      socketRef.current.emit("new-user", inp);
    }
  };

  const onUserRemove = (data: string) => {
    if (socketRef.current) {
      socketRef.current.emit("delete-user", data);
    }
  };

  return (
    <div>
      <div className=" border-2 p-2 m-2 shadow-2xl">
        <input
          className="w-62.5 border-2 p-2"
          type="text"
          value={inp}
          onChange={(e) => setInp(e.target.value)}
        />
        <button onClick={onUserSave}>save</button>
      </div>
      <h1>User list</h1>
      <div className="flex flex-col gap-2">
        {users?.map((i) => (
          <div className="flex gap-2">
            <p key={i}>{i}</p>
            <button onClick={() => onUserRemove(i)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
