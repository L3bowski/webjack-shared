import { Player } from '../models/player';
import { Table } from '../models/table';
import blackJackService from './black-jack-service';
import playerService from './player-service';
import handService from './hand-service';
import tableService from './table-service';
import { Hand } from '../models/hand';
import { HandStatus } from '../models/hand-status';
import cardSetService from './card-set-service';
import { CardSet } from '../models/card-set';

const gameParameters = require('../../game-parameters');

// TODO Access to models properties should be done in the model service
// e.g. table.players.forEach(whatever) => tableService.whatever

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

const dealCard = (hand: Hand, cardSet: CardSet) => {
    handService.addCard(hand, cardSetService.getNextCard(cardSet));
};

const double = (table: Table, player: Player) => {
    const currentHand = playerService.getCurrentHand(player);

    if (!blackJackService.canDouble(currentHand)) {
        throw 'Doubling is only allowed with 9, 10 or 11 points';
    }

    const bet = handService.getBet(currentHand);
    handService.setBet(currentHand, bet * 2);
    playerService.increaseEarningRate(player, -bet);
    dealCard(currentHand, tableService.getCardSet(table));
    handService.markAsPlayed(currentHand);
    moveRoundForward(table);
};

const ensurePlayer = (table: Table, playerId: string) => {
    const currentPlayer = tableService.getActivePlayer(table);
    if (!currentPlayer) {
        throw 'No one is playing now';
    }

    if (currentPlayer.id !== playerId) {
        throw 'Not allowed to play now. It is ' + currentPlayer.name + '\'s turn';
    }

    return currentPlayer;
};

const hit = (table: Table, player: Player) => {
    const currentHand = playerService.getCurrentHand(player);
    dealCard(currentHand, tableService.getCardSet(table));
    moveRoundForward(table);
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
    const activePlayer = tableService.getActivePlayer(table);
    if (tableService.isDealer(table, activePlayer)) {
        // All players have completed their hands; time to play dealer's turn
        playDealerTurnTrigger(table);
    }
    else {
        const currentHand = playerService.getCurrentHand(activePlayer);

        if (blackJackService.wasHandSplit(currentHand)) {
            dealCard(currentHand, tableService.getCardSet(table));
        }

        const isHandFinished = updateHandStatus(currentHand);
        if (isHandFinished) {
            moveRoundForward(table);
        }
        else {
            makeDecisionTrigger(table, activePlayer);
        }
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

    const hand = handService.create(bet);
    playerService.setHands(player, [hand]);
    playerService.increaseEarningRate(player, -bet);

    if (!tableService.hasTrigger(table)) {
        startRoundTrigger(table);
    }
};

const playDealerTurn = (table: Table) => {
    tableService.clearTrigger(table);

    const dealer = tableService.getDealer(table);
    const dealerHand = playerService.getCurrentHand(dealer);
    dealCard(dealerHand, tableService.getCardSet(table));
    let dealerHandValue = handService.getValue(dealerHand);
    const dealerInterval = setInterval(() => {
        if (dealerHandValue >= 17) {
            clearInterval(dealerInterval);

            handService.markAsPlayed(dealerHand);

            table.players.forEach(player => {
                const playerHands = playerService.getHands(player);
                const handsEarnings = playerHands.map(hand => {
                    const handEarnings = blackJackService.getHandEarnings(hand, dealerHand);
                    hand.bet = 0;
                    return handEarnings;
                });
                const earningRate = handsEarnings.reduce((x, y) => x + y, 0);
                playerService.updateEarningRate(player, earningRate);
            });
        
            endRoundTrigger(table);
        }
        else {
            dealCard(dealerHand, tableService.getCardSet(table));
            dealerHandValue = handService.getValue(dealerHand);
        }
    }, 1000);
};

const split = (table: Table, player: Player) => {
    const currentHand = playerService.getCurrentHand(player);

    if (!blackJackService.canSplit(currentHand)) {
        throw 'Splitting is only allowed with two equal cards!';
    }

    const handLastCard = currentHand.cards.splice(-1)[0];

    const newHand = handService.create(currentHand.bet);
    handService.addCard(newHand, handLastCard);

    const index = player.hands.findIndex(hand => hand == currentHand);
    player.hands.splice(index + 1, 0, newHand);

    dealCard(currentHand, tableService.getCardSet(table));

    playerService.increaseEarningRate(player, -currentHand.bet);
    moveRoundForward(table);
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
            tableService.removePlayer(table.id, p.id);
        }
    });

    tableService.setRoundBeingPlayed(table, true);
    
    const playersHand = activePlayers.map(playerService.getCurrentHand);
    playersHand.forEach(hand => dealCard(hand, tableService.getCardSet(table)));

    const dealer = tableService.getDealer(table);
    const dealerHand = handService.create(0);
    playerService.setHands(dealer, [dealerHand]);
    dealCard(dealerHand, tableService.getCardSet(table));

    playersHand.forEach(hand => {
        dealCard(hand, tableService.getCardSet(table));
        const isBlackJack = blackJackService.isBlackJack(hand);
        if (isBlackJack) {
            handService.setStatus(hand, HandStatus.BlackJack);
            handService.markAsPlayed(hand);
        }
    });

    moveRoundForward(table);
};

const updateHandStatus = (playerHand: Hand) => {
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
    }

    return isHandFinished;
};

export {
    makeDecision,
    makeVirtualDecision,
    placeBet
};

export default {
    makeDecision,
    makeVirtualDecision,
    placeBet
};
