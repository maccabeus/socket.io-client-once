# Socket.io Client Once

Socket.io Client once is a very simple package that allows you to avoid the multiple event listening issues associated with `socket.io` client library.

This simple `library` prevents multiple creation of socket listeners that grossly affect performance with `SAP` applications.

## Creating socket client instance

This library similar interface with the traditional `socket.io` library, so it can be easily replaced any existing `socket.io-client` implementation, `or so I thought`.

```ts
import { io } from "socket.io-client-once";

const client = io("socket.io-url", {
  // accept all socket.io client options
  transports: ["websocket"],
  autoConnect: true,
});

client.on("event-to-listen-to", (data: any) => {
  // process  response data
  console.log(data);
});

client.emit("event-to-emit", {
  // event data
});
```

## Event listener order

When you add multiple event listener of the same event, only the last listener will be processed.
see the example below:

```ts
/**
 * Despite adding multiple event listeners for the same event, only the last listener added
 * will be processed.
 *
 * @note this allows us to avoid multiple instance listener scenario synonymous with
 * socket.io client libraries. So our listener will only fire once
 **/

client.on("event-to-listen-to", (data: any) => {
  // This listener will not be processed
});
client.on("event-to-listen-to", (data: any) => {
  // Only the last listener will be processed
});
```

## Getting the underlining socket.io client

To get the underlining socket.io client instance, you can use the following. This will enable you to perform any other task related traditional socket.io client

## License

[MIT](LICENSE)
