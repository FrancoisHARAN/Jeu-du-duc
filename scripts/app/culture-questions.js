/* Rendu Culture G. : questions, médias, réponses et séries ; le tirage reste dans main-game. */
(function (global) {
  function create({ elements, state, setBackground, quizEvent, showQuestion }) {
    let mediaRequest = 0;
    const cultureStreaks = new Map();
    let cultureTurn = null;
    // Mots en tête de question qu'on peut passer en minuscule après « Prénom, »
    const LOWERCASE_STARTERS = new Set([
      'quel',
      'quelle',
      'quels',
      'quelles',
      'qui',
      'que',
      "qu'est-ce",
      'quoi',
      'combien',
      'comment',
      'où',
      'pourquoi',
      'quand',
      'lequel',
      'laquelle',
      'lesquels',
      'lesquelles',
      'dans',
      'en',
      'de',
      'du',
      'des',
      'sur',
      'pour',
      'avec',
      'chez',
      'complète',
      'parmi',
      'à',
      'au',
      'aux',
      'le',
      'la',
      'les',
      'un',
      'une',
      'ce',
      'cette',
      'ces',
      'cet',
      'son',
      'sa',
      'ses',
      'il',
      'elle',
      'on',
      'est-ce',
      'si',
      'depuis',
      'avant',
      'après',
      'par',
      'cite',
      'donne',
      'trouve',
      'devine',
      'selon',
      'entre',
      'sans',
      'contre',
      'vrai',
      'quelqu',
      'traduis',
      'termine',
      'l',
      'd',
      'qu',
      'jusqu',
      'environ',
      'lors',
      'pendant',
      'sous',
      'hors',
      'juste',
      'ton',
      'ta',
      'tes',
      'génétiquement',
      'techniquement',
      'officiellement',
      'historiquement',
      'morte',
      'mort',
      'capturé',
      'recalé',
      'déroulé',
      'partie',
      'champions',
      'allemand',
      'français',
      'française',
      'né',
      'née',
      'âgé',
      'âgée',
      'surnommé',
      'surnommée',
      'parmi',
      'voici',
      'lorsque',
      'lorsqu',
      'deux',
      'douze',
      'aucun',
      'chaque',
      'nous',
      'toutes',
      'durant',
      'comparé',
      'contrairement',
      'au-delà',
      'au-dessus',
      'grâce',
      'plus',
      'vers',
      'puisqu',
    ]);
    // Premier mot écrit sans son accent dans certaines questions (« A quelle… », « Ou se trouve… »)
    const ACCENTED_STARTERS = { a: 'à', ou: 'où' };

    function markCultureResponse(correct) {
      if (!cultureTurn || cultureTurn.answered) return false;
      cultureTurn.answered = true;
      if (state.currentMode === 'culture') {
        cultureStreaks.set(
          cultureTurn.key,
          correct ? (cultureStreaks.get(cultureTurn.key) || 0) + 1 : 0
        );
        if (!correct) window.JDDVisuals.updateStreak(document.getElementById('cultureStreak'), 0);
      }
      return true;
    }

    function addressPlayer(playerName, sentence) {
      const text = String(sentence || '').trim();
      const firstWord = text.split(/[\s,:;!?«»"'’]/)[0].toLowerCase();
      const accented = ACCENTED_STARTERS[firstWord];
      const body = accented
        ? accented + text.slice(firstWord.length)
        : LOWERCASE_STARTERS.has(firstWord)
          ? text.charAt(0).toLowerCase() + text.slice(1)
          : text;
      return playerName ? `${playerName}, ${body}` : text;
    }

    function hideQuestionArea() {
      mediaRequest += 1;
      delete elements.gameScreen.dataset.flagKind;
      elements.questionMedia.classList.remove('quiz-question-media--monochrome');
      elements.questionMedia.replaceChildren();
      elements.questionMedia.classList.add('hidden');
      elements.questionMediaStatus.replaceChildren();
      elements.questionMediaStatus.classList.add('hidden');
      elements.mcqBox.style.display = 'none';
      elements.mcqGrid.innerHTML = '';
      elements.mcqGrid.className = 'mcq-grid';
      elements.mcqGrid.onclick = null;
      elements.answerBox.style.display = 'none';
      elements.showAnswerButton.style.display = 'none';
      elements.answerText.textContent = '';
    }

    function showCultureExtras() {
      elements.cultureToggleContainer.classList.remove('hidden');
      if (state.cultureDrinkMode) {
        const amount = Math.floor(Math.random() * 3) + 1;
        elements.gorgeesText.textContent = `${amount} gorgée${amount > 1 ? 's' : ''}`;
        elements.gorgeesText.classList.remove('hidden');
      }
    }

    function renderQuizImages(question, options, buttons, onReady) {
      const request = mediaRequest;
      const images = [];
      const addImage = (parent, url, alt, credit) => {
        const figure = document.createElement('figure');
        figure.className = 'quiz-image-figure';
        const image = document.createElement('img');
        image.className = 'quiz-image';
        image.alt = alt;
        image.decoding = 'async';
        figure.appendChild(image);
        if (credit && credit !== 'null') {
          const caption = document.createElement('figcaption');
          caption.textContent = credit.replace(/§/g, ' · ');
          figure.appendChild(caption);
        }
        parent.appendChild(figure);
        images.push({ image, url, loaded: false, failed: false });
      };
      if (question.image) {
        elements.questionMedia.classList.remove('hidden');
        addImage(
          elements.questionMedia,
          question.image,
          'Image de la question',
          question.imageCredit
        );
      }
      options.forEach((option, index) => {
        if (option.image)
          addImage(
            buttons[index],
            option.image,
            `Proposition ${String.fromCharCode(65 + index)}`,
            option.credit
          );
      });
      if (!images.length) return;

      const update = () => {
        if (request !== mediaRequest) return;
        const failed = images.some((item) => item.failed);
        const ready = images.every((item) => item.loaded);
        buttons.forEach((button) => {
          button.disabled = !ready;
        });
        elements.questionMediaStatus.replaceChildren();
        elements.questionMediaStatus.classList.toggle('hidden', ready);
        if (ready) {
          onReady?.();
          return;
        }
        const text = document.createElement('p');
        text.textContent = failed
          ? 'Une image n’a pas pu être chargée. Réessaie ou passe à la question suivante.'
          : 'Chargement des images…';
        elements.questionMediaStatus.appendChild(text);
        if (failed) {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.textContent = 'Réessayer';
          retry.addEventListener('click', (event) => {
            event.stopPropagation();
            images
              .filter((item) => item.failed)
              .forEach((item) => {
                item.failed = false;
                item.image.removeAttribute('src');
                item.image.src = item.url;
              });
            update();
          });
          const next = document.createElement('button');
          next.type = 'button';
          next.textContent = 'Question suivante';
          next.addEventListener('click', (event) => {
            event.stopPropagation();
            showQuestion();
          });
          elements.questionMediaStatus.append(retry, next);
        }
      };
      update();
      images.forEach((item) => {
        item.image.addEventListener('load', () => {
          item.loaded = true;
          item.failed = false;
          update();
        });
        item.image.addEventListener('error', () => {
          item.loaded = false;
          item.failed = true;
          update();
        });
        item.image.src = item.url;
      });
    }

    function renderMcq(question, playerName) {
      question = window.JDD.prepareFlagQuestion(question);
      const resultEvent = quizEvent(playerName);
      const isTrueFalse = question.vf === true;
      const prompt = question.image
        ? question.imageTitle || 'Quelle est la bonne réponse pour cette image ?'
        : question.question;
      elements.typeBox.textContent = 'CULTURE G.';
      setBackground('CULTURE G.');
      elements.currentQuestion.textContent = isTrueFalse
        ? `${playerName ? `${playerName}, v` : 'V'}rai ou faux : ${question.question}`
        : addressPlayer(playerName, prompt);

      if (question.flagKind) elements.gameScreen.dataset.flagKind = question.flagKind;
      elements.questionMedia.classList.toggle(
        'quiz-question-media--monochrome',
        Boolean(question.monochrome)
      );

      elements.answerBox.style.display = 'block';
      elements.mcqBox.style.display = 'block';
      elements.mcqGrid.innerHTML = '';
      elements.mcqGrid.classList.toggle('mcq-grid--vf', isTrueFalse);
      elements.mcqGrid.classList.toggle('mcq-grid--images', Boolean(question.choiceImages));

      const recordResponse = (correct, detail = {}) => {
        if (!markCultureResponse(correct)) return false;
        window.JDDCloud.record(
          resultEvent,
          [
            {
              participant: resultEvent?.participants[0],
              metrics: {
                questions_answered: 1,
                correct_answers: Number(correct),
              },
            },
          ],
          {
            question_id: String(
              question.id || window.JDD.cardId?.(question) || question.question
            ).slice(0, 240),
            ...detail,
            correct,
          }
        );
        return true;
      };
      if (question.interaction) {
        const interaction = window.JDD.renderFlagInteraction(
          question,
          elements.mcqGrid,
          (correct, detail, answer) => {
            if (!recordResponse(correct, detail)) return;
            // Arrêter le tap de validation, puis rendre le tap à droite à la navigation habituelle.
            elements.mcqGrid.onclick = (event) => {
              event.stopPropagation();
              elements.mcqGrid.onclick = null;
            };
            elements.answerText.textContent =
              question.interaction === 'spell'
                ? `${correct ? '✓' : 'Réponse :'} ${answer}`
                : answer;
          },
          showQuestion
        );
        renderQuizImages(question, interaction.options, interaction.buttons, interaction.ready);
        return;
      }

      const credits = (question.imageCredit || '').split('±');
      const options = question.choices.map((label, index) => ({
        label,
        sourceIndex: index,
        correct: index === question.answerIndex,
        image: question.choiceImages && question.choiceImages[index],
        credit: credits[index],
        color: question.choiceColors && question.choiceColors[index],
      }));
      if (!isTrueFalse) {
        window.JDD.shuffle(options);
      }

      const buttons = options.map((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mcq-btn';
        if (option.image) {
          button.classList.add('mcq-btn--image');
          button.setAttribute(
            'aria-label',
            `Proposition ${String.fromCharCode(65 + elements.mcqGrid.children.length)}`
          );
        } else {
          if (option.color) {
            const swatch = document.createElement('span');
            swatch.className = 'flag-color-swatch';
            swatch.style.backgroundColor = option.color;
            swatch.setAttribute('aria-hidden', 'true');
            button.appendChild(swatch);
          }
          const label = document.createElement('span');
          label.className = 'mcq-label';
          label.textContent = option.label;
          button.appendChild(label);
        }
        button.addEventListener(
          'click',
          (event) => {
            event.stopPropagation();
            if (!recordResponse(option.correct, { selected_answer: option.sourceIndex })) return;
            buttons.forEach((btn, index) => {
              btn.disabled = true;
              if (options[index].correct) btn.classList.add('mcq-correct');
            });
            if (!option.correct) button.classList.add('mcq-wrong');
            elements.questionMedia.classList.remove('quiz-question-media--monochrome');
            if (question.note) elements.answerText.textContent = `💡 ${question.note}`;
          },
          { once: true }
        );
        elements.mcqGrid.appendChild(button);
        return button;
      });
      renderQuizImages(question, options, buttons);
    }

    function fitCultureText() {
      requestAnimationFrame(() => {
        if (
          elements.gameScreen.classList.contains('hidden') ||
          elements.gameScreen.dataset.category !== 'culture'
        )
          return;
        // Garder les mots entiers, même pour une URL ou un nom très long du classeur.
        const labels = [
          elements.currentQuestion,
          ...elements.mcqGrid.querySelectorAll('.mcq-label, .flag-match-name'),
        ];
        labels.forEach((label) => {
          label.style.fontSize = '';
          let size = parseFloat(getComputedStyle(label).fontSize);
          while (size > 8 && label.scrollWidth > label.clientWidth + 1) {
            size -= 0.5;
            label.style.fontSize = `${size}px`;
          }
        });
      });
    }

    function renderOpenQuestion(question, playerName) {
      const resultEvent = quizEvent(playerName);
      elements.typeBox.textContent = 'CULTURE G.';
      setBackground('CULTURE G.');
      elements.currentQuestion.textContent = addressPlayer(playerName, question.question);
      elements.showAnswerButton.style.display = 'inline-block';
      elements.answerBox.style.display = 'block';
      elements.showAnswerButton.onclick = (event) => {
        event.stopPropagation();
        elements.answerText.textContent = `✅ Réponse : ${question.answer}${question.note ? ` — ${question.note}` : ''}`;
        elements.showAnswerButton.style.display = 'none';
        state.answerShownAt = event.timeStamp;
        window.JDDCloud.record(
          resultEvent,
          [{ participant: resultEvent?.participants[0], metrics: { answers_revealed: 1 } }],
          { question_id: String(question.id || question.question).slice(0, 240) }
        );
        if (state.currentMode === 'culture') {
          const verdicts = document.getElementById('cultureVerdicts');
          verdicts.hidden = false;
          verdicts.innerHTML =
            '<button type="button" data-culture-verdict="wrong">✕ Incorrect</button><button type="button" data-culture-verdict="correct">✓ Correct</button>';
          verdicts.querySelectorAll('button').forEach((button) =>
            button.addEventListener(
              'click',
              (event) => {
                event.stopPropagation();
                const correct = button.dataset.cultureVerdict === 'correct';
                if (!markCultureResponse(correct)) return;
                verdicts.querySelectorAll('button').forEach((node) => {
                  node.disabled = true;
                });
                button.classList.add(correct ? 'mcq-correct' : 'mcq-wrong');
                window.JDDCloud.record(
                  resultEvent,
                  [
                    {
                      participant: resultEvent?.participants[0],
                      metrics: {
                        answers_revealed: 1,
                        questions_answered: 1,
                        correct_answers: Number(correct),
                      },
                    },
                  ],
                  { question_id: String(question.id || question.question).slice(0, 240), correct }
                );
              },
              { once: true }
            )
          );
        }
      };
    }
    function beginTurn(identity, player) {
      cultureTurn = { key: identity ? `${identity.kind}:${identity.id}` : player, answered: false };
      window.JDDVisuals.updateStreak(
        document.getElementById('cultureStreak'),
        state.currentMode === 'culture' ? cultureStreaks.get(cultureTurn.key) || 0 : 0
      );
    }
    function endTurn() {
      if (cultureTurn && !cultureTurn.answered) markCultureResponse(false);
      cultureTurn = null;
      window.JDDVisuals.updateStreak(document.getElementById('cultureStreak'), 0);
    }
    function resetSession() {
      cultureStreaks.clear();
      cultureTurn = null;
    }
    return {
      beginTurn,
      endTurn,
      resetSession,
      hideQuestionArea,
      showCultureExtras,
      renderMcq,
      fitCultureText,
      renderOpenQuestion,
    };
  }
  global.JDDCultureQuestions = { create };
})(window);
