import {
    Socket as IOSocket,
    io as SocketIO,
    ManagerOptions as IOManagerOpt,
    SocketOptions as IOSocketOpt
} from "socket.io-client";

export type SocketInstance = IOSocket;
export type ManagerOptions = IOManagerOpt;
export type SocketOptions = IOSocketOpt;

type SocketOptionsAlias = Partial<ManagerOptions & SocketOptions>;

export interface Socket {
    on(...args: any[]): void;
    emit(...args: any[]): void;
    once(...args: any[]): void;
    connect(...args: any[]): void;
    socket: SocketInstance;
    options: SocketOptionsAlias | undefined;
    uri: string;
    [propName: string]: any
}

interface SocketEventHandler {
    (...args: any[]): any
}
type SocketListener = (event: string, args: SocketEventHandler, interval?: number) => any
type SocketListenerMethod = (event?: string, args?: SocketEventHandler, interval?: number) => any
type EventFilter = (event: string, args: SocketEventHandler, data: any, timestamp?: number) => any
type SocketEmitter = (event: string, data?: any, interval?: number) => any
type EventMap = Map<string, SocketListener>;
interface EmitterMapData {
    event: string;
    data?: any;
    interval?: number
};
interface ListenerProcData {
    [propName: string]: number
}
type EmitterMap = Array<EmitterMapData>;
/**
 * maps of all socket.io events
 */
let eventMaps: EventMap = new Map();
/**
 * List of queued events not yet added as a socket listener
 */
let queuedEventMaps: EventMap = new Map();
/**
 * A map of emitters not yet fired. This will usually be occasioned when 
 * the socket instance is disconnected. They will be deleted once `emitted`
 */
let queuedEmitterMaps: EmitterMap = [];
/**
 * Data that handles listener processing in real-time. This is to prevent socket.io 
 * from firing two successive event despite using socketInstance.off(eventName) in
 * {@link onHandler on handler}
 * 
 * Once an event is running, we will process and
 */
let listenerProcData: ListenerProcData = {};
/**
 * Socket instance 
 */
let socketInstance: SocketInstance;
/**
 * The socket options provided
 */
let socketOptions: SocketOptionsAlias | undefined;
/**
 * The socket `uri` string value
 */
let socketUri: string | null = null;
/**
 * Index that track the retry interval. We will only add or emit event when 
 * the socket instance is ready and properly connected 
 * @default null
 */
let retryIntervalIndex: any = null;
/**
 * Index to capture emitter retries
 */
let retryEmitterIntervalIndex: any = null;
/**
 * Default interval to retry adding event listener  or emit event
 */
const DEFAULT_RETRY_INTERVAL: number = 2000;
/**
 * The retry interval to connect to listener or emitter
 */
let retryInterval: number = DEFAULT_RETRY_INTERVAL;
/**
 * Create a socket.io instance. 
 * 
 * @param uri The socket uro
 * @param options  The socket options
 * @returns 
 */
export const io = (uri: string, options?: SocketOptionsAlias): Socket => {
    if (options?.reconnectionDelay) {
        retryInterval = options?.reconnectionDelay;
    }
    const socket = createSocketInstance(uri, options);
    return socket;
}
/**
 * Handle the `socket.on(eventName)` calls 
 * 
 * This call ensures that only one listener instance is created rather 
 * than the usual 
 * 
 * @param event The event name
 * @param listener The event listener
 */
const onHandler: SocketListener = (event, listener): boolean => {
    if (!socketInstance.connected) {
        retryAddingOnHandlers(event, listener);
        return false;
    }
    if (eventMaps.has(event)) {
        /** Delete the event if we are already listening */
        socketInstance?.off(event);
        socketInstance?.on(event, (data: any) => filterEvent(event, listener, data));
    } else {
        socketInstance?.on(event, (data: any) => filterEvent(event, listener, data));
        eventMaps.set(event, listener);
    }
    return true;
}
/**
 * Handle the `socket.once(eventName)` call. This is an alias for 
 * the `onHandler` handler 
 * 
 * @param event The event name 
 * @param listener The event listener to attache
 */
const onceHandler: SocketListener = (event, listener) => {
    onHandler(event, listener)
}
/**
 * Emits a socket event 
 * 
 * @param event Event name to emit 
 * @param data The data 
 */
const emitHandler: SocketEmitter = (event, data) => {
    if (!socketInstance.connected) {
        /** 
         * Add this event to emit and return false 
         * @note this event will be emitted when we call {@link retryAddingOnHandlers }
         * We will only emit event when we are sure all listener have been properly added
         * */
        queuedEmitterMaps.push({ event, data });
        return false;
    }
    socketInstance?.emit(event, data);
}/**
 * Filter the socket response to prevent a peculiar double  tap scenario
 * 
 * @param event Event name 
 * @param listener Event listener
 * @param data The response data 
 * @param timestamp Optional timestamp  for response
 * @returns 
 */
const filterEvent: EventFilter = (event, listener, data, timestamp) => {
    /**
     * @todo implement an algorithm to  prevent `multi-tap`  when same listener fires 
     * `twice` on the same event.
     */
    return listener(data);
}
/**
 * Connect to a socket instance;
 * 
 * @param uri The socket connection `uri`
 * @param options The socket connection options
 * @returns {boolean} True or false 
 */
const connect = (uri?: string, options?: SocketOptionsAlias): boolean => {
    const usableUri = uri ?? socketUri;
    if (!usableUri) {
        throw Error("No valid socket URI provided")
    }
    if (!socketInstance) {
        createSocketInstance(usableUri, options);
    }
    socketInstance.connect();
    return true;
}
/**
 * Create an instance of socket 
 * 
 * @param uri The socket `Uri`
 * @param options The socket options
 * @returns {SocketType} a socket instance
 */
const createSocketInstance = (uri: string, options?: SocketOptionsAlias): Socket => {
    socketInstance = SocketIO(uri, options);
    /**
     * Set instance variables 
     */
    socketUri = uri;
    socketOptions = options;
    /**
     * Add listeners refresh. This will enable us to re-attache all the events
     */
    socketInstance.on("connected", () => {
        if (options?.autoConnect) {
            refreshListeners(eventMaps);
        }
    });
    type SocketTypes = typeof socketInstance;

    return {
        ...socketInstance,
        on: onHandler,
        once: onceHandler,
        emit: emitHandler,
        socket: socketInstance,
        connect: connect,
        options: socketOptions,
        uri: socketUri
    };
}
const refreshListeners = (eventMaps: EventMap) => {
    console.log("connection established");
    retryAddingOnHandlers();
}

const retryAddingOnHandlers: SocketListenerMethod = (event, listener, interval = retryInterval) => {
    (event && listener) && queuedEventMaps.set(event, listener);
    if (!retryIntervalIndex) {
        retryIntervalIndex = setInterval(() => {
            if (socketInstance.connected) {
                queuedEventMaps.forEach((listener, event: string) => {
                    /** Add the event listener and remove from queue */
                    onHandler(event, listener);
                    queuedEventMaps.delete(event);
                });
                clearInterval(retryIntervalIndex);
                /**
                 * Once all listeners are added, we must now start emitting all 
                 * the queued emitters
                 */
                retryAddingEmitters(queuedEmitterMaps);
            }
        }, interval);
    }
}
const retryAddingEmitters = (queuedEmitters: EmitterMap, interval: number = retryInterval) => {
    if (!retryEmitterIntervalIndex) {
        retryEmitterIntervalIndex = setInterval(() => {
            if (socketInstance.connected) {
                queuedEmitters.forEach((emitterData: EmitterMapData, index: number) => {
                    const { data, event } = emitterData;
                    emitHandler(event, data);
                    queuedEmitters.splice(index, 1);
                });
                clearInterval(retryEmitterIntervalIndex);
            }
        }, interval);
    }
}