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

  const producersRef = useRef<Map<string, TProducer>>(new Map());
  const recvTransportRef = useRef<mediasoupClient.types.Transport>(undefined);

  const consumeProducer = async (producerId: string) => {
    const recvTransport = recvTransportRef.current;
    const device = deviceRef.current;
    const socket = socketRef.current;

    console.log("Checking things are ready in consume producer method: ", {recvTransport ,device,socket})

    if (!recvTransport || !device || !socket) return;

    const consumeParams = await (socket as any)?.emitWithAck("consume", {
      room,
      producerId,
      rtpCapabilities: device.rtpCapabilities,
    });

    console.log("Consume params from backend: ", consumeParams)

    const { id, kind, rtpParameters } = consumeParams;

    const consumer = await recvTransport.consume({
      id,
      producerId,
      kind,
      rtpParameters,
    });

    const stream = new MediaStream();
    stream.addTrack(consumer.track);
    // 4️⃣ Attach to DOM
    if (kind === "video") {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      document.body.appendChild(video);
    }

    if (kind === "audio") {
      const audio = document.createElement("audio");
      audio.srcObject = stream;
      audio.autoplay = true;
      document.body.appendChild(audio);
    }

    await (socket as any).emitWithAck("resume-consumer", {
      room,
      consumerId: consumer.id,
    });
  };

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
          const sendTranport =
            deviceRef.current?.createSendTransport(sendTransportsInfo);
          console.log({ sendTranport });

          // first you need to implement sendTranport?.on("produce") and await sendTranport?.produce({ track: videoTrack });
          // because without that, this event sendTranport?.on("connect") will not execute
          sendTranport?.on("connect", async ({ dtlsParameters }, cb) => {
            console.log("Send transport connecting to server.........");
            const isConnectedSendTransport: boolean = await socket.emitWithAck(
              "connect-sendTransport",
              {
                room,
                transportId: sendTranport.id,
                dtlsParameters,
              }
            );
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
          });

          sendTranport?.on("produce", async ({ kind, rtpParameters }, cb) => {
            const { id }: { id: string } = await socket.emitWithAck("produce", {
              room,
              kind,
              rtpParameters,
              transportId: sendTranport.id,
            });
            cb({ id });
          });
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
          });

          const videoTrack = stream.getVideoTracks()[0];
          await sendTranport?.produce({ track: videoTrack });
        }

        socket.on("new-producer", async (data: TProducer) => {
          const { producerId, kind, peerId } = data ?? {};
          console.log(
            "New producer detected:",
            producerId,
            "from peer:",
            peerId,
            "kind:",
            kind
          );
          producersRef.current.set(producerId, {
            producerId,
            peerId,
            kind,
          });
          console.log("Going to consume the producer: ", { producerId });
          await consumeProducer(producerId);
        });

        ////////////////////////////////////////////
        ////////////////////////////////////////////
        // RECIEVE TRANPORT PART ------------------
        // -----------------------------------------
        const recvTransportInfo: mediasoupClient.types.TransportOptions =
          await socket.emitWithAck("create-transport", {
            room,
            direction: "RECV",
          });
        console.log(
          "Got recieve transport info: ",
          sendTransportsInfo,
          " Now creating recieve transport -> "
        );
        if (recvTransportInfo.id) {
          const recvTransport =
            deviceRef.current?.createRecvTransport(recvTransportInfo);
          console.log({ recvTransport });

          recvTransportRef.current = recvTransport;

          recvTransport?.on(
            "connect",
            async ({ dtlsParameters }, cb, errback) => {
              console.log("Recieve transport connecting to server.........");
              const ok = await socket.emitWithAck("connect-recvTransport", {
                room,
                transportId: recvTransport.id,
                dtlsParameters,
              });

              if (ok) cb();
              else errback(new Error("Recv transport DTLS failed"));
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

type TProducer = { producerId: string; peerId: string; kind: string };
