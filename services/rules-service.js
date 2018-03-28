'use strict';

const handService = require('./hand-service');
const handSetService = require('./hand-set-service');
const playerService = require('./player-service');
const playerSetService = require('./player-set-service');

// TODO Split function in 2
const checkBlackJackOrLoses = (game, player, handScore, playerHand, initialDealing) => {
    if (handScore === 21 && playerHand.cards.length === 2) {
        handService.setStatus(playerHand, 'BlackJack');
        if (!initialDealing) {
            startNextHand(game, player);
        }
    }                
    else if (handScore > 21) {
        handService.setStatus(playerHand, 'Loses');
        if (!initialDealing) {
            startNextHand(game, player);
        }
    }
};

const dealCard = (game, player, card, initialDealing) => {
    playerService.dealCard(player, card);
    var playerHand = playerService.getCurrentHand(player);
    var handScore = handService.getScore(playerHand);
    checkBlackJackOrLoses(game, player, handScore, playerHand, initialDealing);
    return handScore;
};

const dealerTurn = (game, cardGetter) => {
    var dealerHand = playerService.getCurrentHand(playerSetService.getDealer(game.playerSet));
    var dealerScore = handService.getScore(dealerHand);
    while (dealerScore < 17) {
        playerService.dealCard(playerSetService.getDealer(game.playerSet), cardGetter());
        dealerScore = handService.getScore(dealerHand);
    }
    return dealerScore;
};

const double = (game, player, cardGetter) => {
    var playerHand = playerService.getCurrentHand(player);
    var handScore = handService.getScore(playerHand);
    if (handScore < 9 || handScore > 11) {
        throw 'Double only allowed with 9, 10 or 11 points';
    }
    handSetService.doubleCurrentHand(player.handSet);        
    handScore = dealCard(game, player, cardGetter());

    if (handScore < 22) {
        handService.setStatus(playerHand, 'Played');
        startNextHand(game, player);
    }
};

const hit = (game, player, cardGetter) => {
    dealCard(game, player, cardGetter());
};

const resolve = (player, dealerScore) => {
    player.handSet.hands.forEach((hand) => {
        var handScore = handService.getScore(hand);
        var status;

        if (handScore > 21) {
            status = 'Loses';
        }
        else if (handScore === 21 && hand.cards.length === 2) {
            status = 'BlackJack';
        }
        else if (dealerScore > 21) {
            status = 'Wins';
        }
        else if (handScore === dealerScore) {
            status = 'Ties';
        }
        else {
            status = handScore > dealerScore ? 'Wins' : 'Loses';
        }
        handService.setStatus(hand, status);
    });
    playerService.updateEarningRate(player);        
};

const split = (game, player, cardGetter) => {
    var currentHand = handSetService.getCurrentHand(player.handSet);
    if (!handService.isSplitable(currentHand)) {
        throw 'Split only allowed with two equal cards!';
    }
    handSetService.splitCurrentHand(player.handSet);        
    return dealCard(game, player, cardGetter());
};

const stand = (game, player, cardGetter) => {
    var playerHand = playerService.getCurrentHand(player);
    handService.setStatus(playerHand, 'Played');
    startNextHand(game, player, cardGetter);
};

// TODO Move this to game-service. Call it whenever is needed
const startNextHand = (game, player, cardGetter) => {
    var nextHand = handSetService.getNextHand(player.handSet);
    if (nextHand) {
        dealCard(game, player, cardGetter());
    }
    else {
        playerSetService.startNextTurn(game.playerSet);
    }
};

// TODO Receive playerSet instead
const startRound = (game, cardGetter) => {
    // TODO Exclude dealer from players

    game.playerSet.players.forEach(player => {
        playerService.startRound(player);
        dealCard(game, player, cardGetter(), true);
    });

    game.playerSet.players.forEach(player => {
        if (player !== playerSetService.getDealer(game.playerSet)) {
            dealCard(game, player, cardGetter(), true);
        }
    });
};

module.exports = {
    dealerTurn,
    double,
    hit,
    resolve,
    split,
    stand,
    startRound
};
