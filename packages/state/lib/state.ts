import { Hostable, HostableEvents, HostableOptions } from "@skeldjs/core";

import {
    HostGameMessage,
    JoinGameMessage,
    RemovePlayerMessage,
    StartGameMessage,
    GameDataToMessage,
    JoinedGameMessage,
    AlterGameMessage,
    MessageDirection,
    GameOptions,
} from "@skeldjs/protocol";

import { HazelReader } from "@skeldjs/util";

export interface SkeldjsStateManagerEvents extends HostableEvents {}

export class SkeldjsStateManager<
    T extends Record<string, any> = {}
> extends Hostable<T> {
    clientid: number;

    constructor(options: HostableOptions = {}) {
        super({ doFixedUpdate: false, ...options });

        this.decoder.on(HostGameMessage, (message, direction) => {
            if (direction === MessageDirection.Clientbound) {
                this.setCode(message.code);
            }
        });

        this.decoder.on(JoinGameMessage, async (message, direction) => {
            if (
                direction === MessageDirection.Clientbound &&
                message.code === this.code
            ) {
                await this.handleJoin(message.clientid);
                await this.setHost(message.hostid);
            }
        });

        this.decoder.on(StartGameMessage, async (message, direction) => {
            if (
                direction === MessageDirection.Clientbound &&
                message.code === this.code
            ) {
                await this.handleStart();
            }
        });

        this.decoder.on(RemovePlayerMessage, async (message, direction) => {
            if (
                direction === MessageDirection.Clientbound &&
                message.code === this.code
            ) {
                await this.handleLeave(message.clientid);
                await this.setHost(message.hostid);
            }
        });

        this.decoder.on(GameDataToMessage, async (message, direction, sender) => {
            if (
                direction === MessageDirection.Clientbound &&
                message.code === this.code
            ) {
                for (const child of message._children) {
                    this.decoder.emitDecoded(child, direction, sender);
                }
            }
        });

        this.decoder.on(JoinedGameMessage, async (message, direction) => {
            if (direction === MessageDirection.Clientbound) {
                this.clientid = message.clientid;
                await this.setCode(message.code);
                await this.setHost(message.hostid);
                await this.handleJoin(message.clientid);
                for (let i = 0; i < message.others.length; i++) {
                    await this.handleJoin(message.others[i]);
                }
            }
        });

        this.decoder.on(AlterGameMessage, async (message) => {
            if (message.code === this.code) {
                this._setAlterGameTag(message.alter_tag, message.value);
            }
        });
    }

    get me() {
        return null;
    }

    get amhost() {
        return false;
    }

    async handleInboundMessage(message: Buffer) {
        const reader = HazelReader.from(message);
        this.decoder.write(reader, MessageDirection.Clientbound, null);
    }

    async handleOutboundMessage(message: Buffer) {
        const reader = HazelReader.from(message);
        this.decoder.write(reader, MessageDirection.Serverbound, null);
    }

    protected _reset() {
        this.objects.clear();
        this.objects.set(-2, this);
        this.players.clear();
        this.netobjects.clear();
        this.stream = [];
        this.code = 0;
        this.hostid = 0;
        this.settings = new GameOptions;
        this.counter = -1;
        this.privacy = "private";
    }
}
