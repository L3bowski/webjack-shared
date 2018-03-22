'use strict';

const nodeUtils = require('../utils/node');
const js = require('../js-generics');
const HandScore = require('../models/hand-score');
const cardService = require('./card-service');

function addCardScore(handScore, card) {
    var value = cardService.getValue(card);
    if (cardService.isAce(card)) {
        handScore.min += 1;
        handScore.max += (handScore.max + 11 > 21 ? 1 : 11);
    }
    else {
        handScore.min += value;
        handScore.max += value;
    }
}

// TODO Pass hand as parameter
function getCardsScore(cards) {
    var handScore = new HandScore();
    var sortedHand = js.clone(cards)
    .sort((a, b) => {
        return cardService.getValue(a) > cardService.getValue(b);
    });

    js.iterate(sortedHand, (card) => {
        addCardScore(handScore, card);
    });

    if (handScore.max > 21 || handScore.min === handScore.max) {
        handScore.effective = handScore.min;
    }
    else {
        handScore.effective = handScore.max;
    }

    return handScore;
}

function stringify(handScore) {
    if (handScore.max > 21 || handScore.min === handScore.max) {
        return handScore.min.toString();
    }
    else {
        return handScore.min + '/' + handScore.max;
    }
}

module.exports = {
    getCardsScore: nodeUtils.trace('ScoreService', getCardsScore, true),
    stringify: nodeUtils.trace('ScoreService', stringify, true)
};
