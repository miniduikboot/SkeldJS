import { Pet } from "@skeldjs/constant";

import { PlayerEvent } from "./PlayerEvent";
import { Hostable } from "../../Hostable";
import { PlayerData } from "../../PlayerData";

export class SetPetEvent extends PlayerEvent {
    static eventName = "player.setpet" as const;
    eventName = "player.setpet" as const;

    pet: Pet;

    constructor(
        room: Hostable,
        player: PlayerData,
        pet: Pet
    ) {
        super(room, player);

        this.pet = pet;
    }
}
