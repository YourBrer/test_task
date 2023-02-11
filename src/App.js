import React from 'react';

// Итак, представляю на ваш суд приложение с использованием Slomux в моей интерпретации. Далее постараюсь насколько это
// возможно, поэтапно расписать ход моих мыслей и смысл действий.

// Чтобы понять, с чего вообще все в нашем приложении начинается, смотрим, что там передается в рендер ReactDOM.
// А там, по сути, всё просто - провайдер для передачи контекста по всем компонентам внутри провайдера, и два простых
// компонента. Начнем с реализации провайдера.

const Provider = ({store, context, children}) => {
  // Предполагаем, что контекст может быть передан в компонент пропсом, ну а если нет, то создаем свой.
  const Context = context || React.createContext(null);
  // Долго думал, куда бы деть контекст так, чтоб он не лежал в глобальных переменных, и не придумал ничего лучше чем
  // сделать его свойством глобального объекта window. Так к нему и доступ есть отовсюду, и пространство имен
  // не засоряется

  window.globalContext = Context;

  return <Context.Provider value={store}>{children}</Context.Provider>
}

// Провайдер есть. А в контексте провайдера должен находиться стор. Пришло время им заняться. Логика такова - стор
// это просто объект с какими-то данными. Но к этим данным нет прямого доступа. Чтобы эти данные получить или изменить,
// нужно использовать специальные функции.
const createStore = (reducer, initialState) => {
  let currentState = initialState;
  let listeners = [] // массив "слушателей" - функций, вызываемых при каждом изменении стора, что ведет к обновлению
  // данных в компонентах, подписавшихся на эти изменения.

  const getState = () => currentState
  const dispatch = action => { // функция-посредник, передающая полученный её экшен в редьюсер.
    currentState = reducer(currentState, action); // передали экшен в редьюсер, получили обновленный стор
    listeners.forEach(listener => listener()); // а значит, нужно оповестить об этом всех подписавшихся, вызвав
    // каждый слушатель
  }
  const subscribe = listener => listeners.push(listener) // функция подписки - просто добавляет функцию-слушатель в
  // массив слушателей

  return {getState, dispatch, subscribe};
}

// Также довольно простая функция, возвращающая функцию-посредник dispatch из стора
const useDispatch = () => {
  const ctx = React.useContext(window.globalContext)
  if (!ctx) {
    return () => {}
  }

  return ctx.dispatch
}

const defaultState = {
  counter: 1,
  stepSize: 1,
}

// Функция reducer хранит в себе логику изменения стора. А меняет его она в зависимости от полученного экшена.
// Экшен же в свою очередь - простой объект, содержащий строковое описание типа экшена и (не обязательно) какое-то
// значение. reducer смотрит на тип экшена и что-то там делает со стором, исходя из своей внутренней логики.
const reducer = (state = defaultState, action) => {
  switch (action.type) {
    case UPDATE_COUNTER:
      return {...state, counter: state.counter += action.payload * state.stepSize};
    case CHANGE_STEP_SIZE:
      return {...state, stepSize: state.stepSize = +action.payload};
    default:
      return state;
  }
}

// Переменные с текстовым описанием экшенов, тут все просто.
const UPDATE_COUNTER = 'UPDATE_COUNTER'
const CHANGE_STEP_SIZE = 'CHANGE_STEP_SIZE'
// функции, возвращающие экшены, тоже ничего сложного.
const updateCounter = value => ({
  type: UPDATE_COUNTER,
  payload: value,
})
const changeStepSize = value => ({
  type: CHANGE_STEP_SIZE,
  payload: value,
})

// функция простого сравнения двух сущностей
const isEqual = (a, b) => a === b;


// Итак, есть у нас провайдер, есть у нас стор, который передается всем детям. Теперь нужно реализовать хук, который
// будет нам помогать получать данные из стора и запускать рендер компонента, при изменении данных стора, на которые
// подписан компонент. (На эту часть проекта ушло больше всего времени и попыток).
// Хук принимает простую функцию-селектор, которая будет получать стор и возвращать данные из стора. Вторым аргументом
// в хук можно передавать функцию, которая будет сравнивать старое значение из стора и новое и если они не равны, то
// будет обновлен компонент. Короче, функция должна избавить нас от ненужного ререндера.
const useSelector = (selector, equalFunc = isEqual) => {
  const store = React.useContext(window.globalContext); // получаем стор из контекста
  const [, forceUpdate] = React.useReducer(num => num + 1, 0); // конструкция, которая будет помогать нам ререндерить
  // подписанные компоненты.
  const currentState = React.useRef(); // специальная сущность, которая поможет нам изменять данные в компонентах.
  currentState.current = selector(store.getState());

  // Чтобы обновлять значения из стора в компонентах, нам необходимо добавить в стор подписку. Подписка будет представлять
  // собой функцию, получающую новое значение из стора, сравнивающую новое значение с предыдущим, и если они не равны,
  // будет запущен ререндер компонента. Но вместе с тем, будет перезапущен и данный хук - useSelector. И чтобы избежать
  // добавления слушателей в стор при каждом перезапуске хука, подписку будем добавлять через useEffect только при
  // первом запуске хука.
  React.useEffect(() => {
    store.subscribe(() => {
      const nextState = selector(store.getState());
      if (equalFunc(nextState, currentState.current)) {
        return;
      }

      forceUpdate();
    });
  }, []);

  return currentState.current; // возвращаем специальную сущность, по сути своей - ссылку на данные, который сможем менять
  // что приведет и к изменению данных в компоненте
}


// Ну а дальше вообще все просто - компоненты без особой логики. Только подписка на изменения стора через useSelector,
// за счет чего и будут вызываться ререндеры этих компонентов через слушатели. Ну и получение dispatch-функции.
// Пользователем вызывается событие, в зависимости от действия пользователя, функция-создатель экшена возвращает экшен
// в dispatch-функцию, которая передает этот экшен в reducer, который внутри себя все это дело переваривает и возвращает
// обновленный стор, после чего чего вызываются все слушатели и подписанные на измененные данные стора компоненты будут
// ререндерены. Вот, в принципе, и все.
const Counter = () => {
  const counter = useSelector(state => state.counter);
  const dispatch = useDispatch();
  return (
      <div>
        <button onClick={() => dispatch(updateCounter(-1))}>-</button>
        <span> {counter} </span>
        <button onClick={() => dispatch(updateCounter(1))}>+</button>
      </div>
  )
}

const Step = () => {
  const stepSize = useSelector(state => state.stepSize, (current, prev) => current === prev)
  const dispatch = useDispatch()

  return (
      <div>
        <div>Значение счётчика должно увеличиваться или уменьшаться на заданную величину шага</div>
        <div>Текущая величина шага: {stepSize}</div>
        <input
            type="range"
            min="1"
            max="5"
            value={stepSize}
            onChange={({target}) => dispatch(changeStepSize(target.value))}
        />
      </div>
  )
}

function App() {
  return (
      <Provider store={createStore(reducer, defaultState)}>
        <Step/>
        <Counter/>
      </Provider>
  );
}

export default App;
