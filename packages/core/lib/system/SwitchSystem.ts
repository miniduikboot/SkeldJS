import { HazelReader, HazelWriter } from "@skeldjs/util";
import { SystemType } from "@skeldjs/constant";

import { InnerShipStatus } from "../component";
import { SystemStatus } from "./SystemStatus";
import { PlayerData } from "../PlayerData";
import {
    ElectricalSwitchFlipEvent,
    SystemRepairEvent,
    SystemSabotageEvent,
} from "../events";
import { ExtractEventTypes } from "@skeldjs/events";
import { SystemStatusEvents } from "./events";
import { RepairSystemMessage } from "@skeldjs/protocol";

type SwitchSetup = [boolean, boolean, boolean, boolean, boolean];

export interface SwitchSystemData {
    expected: SwitchSetup;
    actual: SwitchSetup;
    brightness: number;
}

export type SwitchSystemEvents = SystemStatusEvents &
    ExtractEventTypes<[
        ElectricalSwitchFlipEvent
    ]>;

/**
 * Represents a system responsible for handling switches in Electrical.
 *
 * See {@link SwitchSystemEvents} for events to listen to.
 */
export class SwitchSystem extends SystemStatus<
    SwitchSystemData,
    SwitchSystemEvents
> implements SwitchSystemData {
    static systemType = SystemType.Electrical as const;
    systemType = SystemType.Electrical as const;

    /**
     * The switch states that are expected.
     */
    expected: SwitchSetup;

    /**
     * The current switch states.
     */
    actual: SwitchSetup;

    /**
     * The brightness of lights.
     */
    brightness: number;

    get sabotaged() {
        return this.actual[0] !== this.expected[0]
            || this.actual[1] !== this.expected[1]
            || this.actual[2] !== this.expected[2]
            || this.actual[3] !== this.expected[3]
            || this.actual[4] !== this.expected[4];
    }

    constructor(ship: InnerShipStatus, data?: HazelReader | SwitchSystemData) {
        super(ship, data);

        this.expected ||= [false, false, false, false, false];
        this.actual ||= [false, false, false, false, false];
        this.brightness ??= 100;
    }

    Deserialize(reader: HazelReader, spawn: boolean) {
        const before = this.sabotaged;
        this.expected = SwitchSystem.readSwitches(reader.byte());
        this.actual = SwitchSystem.readSwitches(reader.byte());
        if (!before && this.sabotaged) {
            this.emit(
                new SystemSabotageEvent(
                    this.room,
                    this,
                    undefined,
                    undefined
                )
            );
        }
        if (before && !this.sabotaged) {
            this.emit(
                new SystemRepairEvent(
                    this.room,
                    this,
                    undefined,
                    undefined
                )
            );
        }
        this.brightness = reader.uint8();
    }

    Serialize(writer: HazelWriter, spawn: boolean) {
        writer.byte(SwitchSystem.writeSwitches(this.expected));
        writer.byte(SwitchSystem.writeSwitches(this.actual));
        writer.uint8(this.brightness);
    }

    async HandleSabotage(player: PlayerData, rpc: RepairSystemMessage|undefined) {
        if (this.sabotaged)
            return;

        const oldActual = this.actual;
        const oldExpected = this.expected;

        while (!this.sabotaged) {
            this.actual = new Array(5).fill(false).map(f => Math.random() > 0.5) as SwitchSetup;
            this.expected = new Array(5).fill(false).map(f => Math.random() > 0.5) as SwitchSetup;
        }

        const ev = await this.emit(
            new SystemSabotageEvent(
                this.room,
                this,
                rpc,
                player
            )
        );

        if (ev.reverted) {
            this.actual = oldActual;
            this.expected = oldExpected;
        }
    }

    async HandleRepair(player: PlayerData, amount: number, rpc: RepairSystemMessage|undefined) {
        await this._setSwitch(amount, !this.actual[amount], player, rpc);
    }

    private async _setSwitch(num: number, value: boolean, player: PlayerData|undefined, rpc: RepairSystemMessage|undefined) {
        if (this.actual[num] === value)
            return;

        const beforeFlipped = this.actual[num];
        this.actual[num] = value;
        this.dirty = true;

        const ev = await this.emit(
            new ElectricalSwitchFlipEvent(
                this.room,
                this,
                rpc,
                player,
                num,
                value
            )
        );

        if (ev.reverted) {
            this.actual[num] = beforeFlipped;
            return;
        }

        if (ev.alteredFlipped !== value) {
            this.actual[num] = ev.alteredFlipped;
        }

        if (ev.alteredSwitchId !== num) {
            this.actual[num] = beforeFlipped;
            this.actual[ev.alteredSwitchId] = ev.alteredFlipped;
        }
    }

    /**
     * Set the value of a switch as flipped or not flipped
     * @param num The ID of the switch to flip.
     * @param value Whether the switch is flipped.
     * @example
     *```typescript
     * // Randomise each switch.
     * for (let i = 0; i < 5; i++) {
     *   electrical.setSwitch(i, Math.random() > 0.5);
     * }
     * ```
     */
    setSwitch(num: number, value: boolean) {
        if (this.actual[num] === value) return;

        this.flip(num);
    }

    /**
     * Invert the position of a switch.
     * @param num The ID of the switch to invert.
     * @example
     *```typescript
     * // Invert the position of each switch.
     * for (let i = 0; i < 5; i++) {
     *   electrical.flip(i);
     * }
     * ```
     */
    flip(num: number) {
        if (!this.room.me)
            return;

        this._setSwitch(num, !this.actual[num], this.room.me, undefined);
    }

    private async _repair(player: PlayerData|undefined, rpc: RepairSystemMessage|undefined) {
        const oldActual = this.actual;
        this.actual = [...this.expected];

        const ev = await this.emit(
            new SystemRepairEvent(
                this.room,
                this,
                rpc,
                player
            )
        );

        if (ev.reverted) {
            this.actual = oldActual;
        }
    }

    async repair() {
        if (!this.room.me)
            return;

        await this._repair(this.room.me, undefined);
    }

    /**
     * Read the value of each switch from a byte.
     * @param byte The byte to read from.
     * @returns An array of the value of each switch.
     * @example
     *```typescript
     * console.log(readSwitches(0x5));
     * // [ true, false, true, false, false ]
     * ```
     */
    static readSwitches(byte: number) {
        const vals: SwitchSetup = [false, false, false, false, false];

        vals[0] = !!(byte & 0x1);
        vals[1] = !!(byte & 0x2);
        vals[2] = !!(byte & 0x4);
        vals[3] = !!(byte & 0x8);
        vals[4] = !!(byte & 0x10);

        return vals;
    }

    /**
     * Write the value of each switch to a byte.
     * @param switches An array of the value of each switch.
     * @returns The byte representation of the switches.
     * @example
     *```typescript
     * console.log(writeSwitches([ false, true, false, false, true ]));
     * // 0x12 (18)
     * ```
     */
    static writeSwitches(switches: SwitchSetup) {
        return (
            ~~switches[0] |
            (~~switches[1] << 1) |
            (~~switches[2] << 2) |
            (~~switches[3] << 3) |
            (~~switches[4] << 4)
        );
    }

    Detoriorate() {
        if (this.sabotaged) {
            if (this.brightness > 0) {
                this.brightness -= 15;
                if (this.brightness < 0)
                    this.brightness = 0;
                this.dirty = true;
            }
        }
    }
}
