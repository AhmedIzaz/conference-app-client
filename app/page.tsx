"use client";
import Image from "next/image";
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

    socket.on("connect", () => {
      console.log(
        "Socket from client connected successfully : id = ",
        socket.id
      );
      socketRef.current = socket;

      socket.emit("join-room", room, (connected: boolean) => {
        console.log(
          "Has joined to room:",
          room,
          " Now getting RTP capabilities of conference room router"
        );
        socket.emit("get-rtp-capabilities", { room }, async (ack: any) => {
          console.log("RTP capability from server: ", ack);
          await deviceRef.current?.load({ routerRtpCapabilities: ack });
        });
      });
      socket.emit("message", { message: "Hello" }, (ack: string) => {
        console.log("event message ack: ", ack);
      });

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
          className="w-[250px] border-2 p-2"
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
