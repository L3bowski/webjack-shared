import { Player } from '../models/player';
import { Table } from '../models/table';
import blackJackService from './black-jack-service';
import playerService from './player-service';
import handService from './hand-service';
import tableService from './table-service';
import { Hand } from '../models/hand';
import { HandStatus } from '../models/hand-status';
const gameParameters = require('../../game-parameters');

const startRoundTrigger = (table: Table) => {
    tableService.clearTrigger(table);
    tableService.setTrigger(table, 7, () => startRound(table));
};
const makeDecisionTrigger = (table: Table, player: Player) =>
    tableService.setTrigger(table, 20, () => stand(table, player));
const playDealerTurnTrigger = (table: Table) =>
    tableService.setTrigger(table, 3, () => playDealerTurn(table));
const endRoundTrigger = (table: Table) =>
tableService.setTrigger(table, 5, () => tableService.endRound(table));

// TODO Access to models properties should be done in the model service
// e.g. table.players.forEach(whatever) => tableService.whatever

const double = (table: Table, player: Player) => {
    const playerHand = playerService.getCurrentHand(player);

    if (!handService.canDouble(playerHand)) {
        throw 'Doubling is only allowed with 9, 10 or 11 points';
    }

    const bet = playerService.getCurrentHandBet(player);
    playerService.setCurrentHandBet(player, bet * 2);
    handService.addCard(playerHand, tableService.getNextCard(table));
    handService.markAsPlayed(playerHand);
    moveRoundForward(table);
};

const ensurePlayer = (table: Table, playerId: string) => {
    const currentPlayer = tableService.getActivePlayer(table);
    if (!currentPlayer) {
        throw 'No one is playing now';
    }

    if (table.activePlayerId !== playerId) {
        throw 'Not allowed to play now. It is ' + currentPlayer.name + '\'s turn';
    }

    return currentPlayer;
};

const hit = (table: Table, player: Player) => {
    const playerHand = playerService.getCurrentHand(player);
    handService.addCard(playerHand, tableService.getNextCard(table));
    updateHandStatus(table, player, playerHand);
};

const _makeDecision = (table: Table, player: Player, decision: string) => {
    tableService.clearTrigger(table);
    try {
        switch (decision) {
            case 'Double': {
                double(table, player);
                break;
            }
            case 'Hit': {
                hit(table, player);
                break;
            }
            case 'Split': {
                split(table, player);
                break;
            }
            case 'Stand': {
                stand(table, player);
                break;
            }
            default:
                throw 'Action not supported';
        }
    }
    catch (error) {
        // If an error is raised (e.g. doubling when not allowed), we set the trigger again
        makeDecisionTrigger(table, player);
        throw error;
    }
};

const makeDecision = (table: Table, playerId: string, decision: string) => {
    const player = ensurePlayer(table, playerId);
    _makeDecision(table, player, decision)
};

const makeVirtualDecision = (table: Table, decision: string) => {
    const currentPlayer = tableService.getActivePlayer(table);
    _makeDecision(table, currentPlayer, decision);
};

const moveRoundForward = (table: Table) => {
    // TODO Base the active player in the unplayed hands
    const player = table.players.find(playerService.hasUnplayedHands);
    if (!player) {
        // All players have completed their hands
        tableService.setActivePlayer(table, table.dealer.id);
        playDealerTurnTrigger(table);
    }
    else if (player.id === table.activePlayerId) {
        // Reaching this branch means the player had more than one hand;
        // he split a hand at some point. A new card must be added to the current hand
        const playerHand = playerService.getCurrentHand(player);
        handService.addCard(playerHand, tableService.getNextCard(table));
        updateHandStatus(table, player, playerHand);
    }
    else {
        tableService.setActivePlayer(table, player.id);
        makeDecisionTrigger(table, player);
    }
};

const placeBet = (table: Table, playerId: string, bet: number) => {
    const player = table.players.find(p => p.id == playerId);
    if (!player) {
        throw 'No player identified by ' + playerId + ' was found';
    }

    if (tableService.isRoundBeingPlayed(table)) {
        throw 'Bets can only be placed before a round starts';
    }

    playerService.initializeHand(player, bet);
    if (!tableService.hasTrigger(table)) {
        startRoundTrigger(table);
    }
};

const playDealerTurn = (table: Table) => {
    tableService.clearTrigger(table);

    if (table.activePlayerId !== table.dealer.id) {
        throw 'Can\'t play dealer round yet!';
    }

    const dealerHand = playerService.getCurrentHand(table.dealer);
    handService.addCard(dealerHand, tableService.getNextCard(table));
    let dealerHandValue = handService.getValue(dealerHand);
    const dealerInterval = setInterval(() => {
        if (dealerHandValue >= 17) {
            clearInterval(dealerInterval);

            table.players.forEach(player => {
                const playerHands = playerService.getHands(player);
                const earningRates = playerHands.map(hand => blackJackService.resolveHand(hand, dealerHandValue));
                const earningRate = earningRates.reduce((x, y) => x + y, 0);
                playerService.updateEarningRate(player, earningRate);
            });
            table.activePlayerId = null;
        
            endRoundTrigger(table);
        }
        else {
            handService.addCard(dealerHand, tableService.getNextCard(table));
            dealerHandValue = handService.getValue(dealerHand);
        }
    }, 1000);
};

const split = (table: Table, player: Player) => {
    blackJackService.splitPlayerCurrentHand(player, table.cardSet);
    const playerHand = playerService.getCurrentHand(player);
    updateHandStatus(table, player, playerHand);
};

const stand = (table: Table, player: Player) => {
    const playerHand = playerService.getCurrentHand(player);
    handService.markAsPlayed(playerHand);
    moveRoundForward(table);
};

const startRound = (table: Table) => {
    tableService.clearTrigger(table);

    const activePlayers = table.players.filter(playerService.hasHands);
    const inactivePlayers = table.players.filter(p => !playerService.hasHands(p));

    if (activePlayers.length == 0) {
        throw 'No one has placed a bet yet!';
    }

    activePlayers.forEach(p => p.inactiveRounds = 0);
    inactivePlayers.forEach(p => {
        playerService.increaseInactiveRounds(p);
        if (p.inactiveRounds > gameParameters.maxInactiveRounds) {
            tableService.exitTable(table.id, p.id);
        }
    });

    tableService.setRoundBeingPlayed(table, true);

    const playersHand = activePlayers.map(playerService.getCurrentHand);
    playerService.initializeHand(table.dealer);
    const dealerHand =  playerService.getCurrentHand(table.dealer);
    
    playersHand.forEach(hand => handService.addCard(hand, tableService.getNextCard(table)));
    handService.addCard(dealerHand, tableService.getNextCard(table));
    playersHand.forEach(hand => {
        handService.addCard(hand, tableService.getNextCard(table))
        // TODO Check for black jack!
    });

    tableService.setActivePlayer(table, activePlayers[0].id);
};

const updateHandStatus = (table: Table, player: Player, playerHand: Hand) => {
    const isBlackJack = blackJackService.isBlackJack(playerHand);
    const isBurned = blackJackService.isBurned(playerHand);
    const isMaxValue = blackJackService.isMaxValue(playerHand);

    if (isBurned) {
        handService.setStatus(playerHand, HandStatus.Burned);
    }
    else if (isBlackJack) {
        handService.setStatus(playerHand, HandStatus.BlackJack);
    }
    
    const isHandFinished = isBlackJack || isBurned || isMaxValue;
    
    if (isHandFinished) {
        handService.markAsPlayed(playerHand);
        moveRoundForward(table);
    }
    else {
        makeDecisionTrigger(table, player);
    }
};

export {
    playDealerTurn,
    makeDecision,
    makeVirtualDecision,
    placeBet,
    startRound
};

export default {
    playDealerTurn,
    makeDecision,
    makeVirtualDecision,
    placeBet,
    startRound
};
