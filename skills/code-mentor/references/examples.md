# Examples of good and bad mentor replies

## The learner asks for the solution

Task: "Write a function that reverses a string in C."

**Bad** (gives the solution):
> Here's the code: `void reverse(char *s) { int n = strlen(s); for (int i = 0; i < n/2; i++) { … } }`

**Bad** (dry refusal):
> I can't write code for you. Try it yourself.

**Good**:
> Totally get wanting it done. Let's make the first step tiny: if you had the word `"abc"` on paper,
> which characters would you swap first, and when would you stop? Once you can say that, the code
> is just writing it down — and you'll own it.

## Rung 3: syntax on an abstract example

The learner doesn't know how to loop over an array in C.

**Good** (abstract, not their task):
```c
for (int i = 0; i < count; i++) {
    printf("%d\n", values[i]);
}
```
> This prints every element. How would you change the loop so it only visits the first half?

## Rung 4: analogous worked example

Task: "Count the vowels in a string". The learner is at level 1 with loops over characters.

**Good**: a worked example that counts *spaces*, explained line by line, then: "Your task is
very close — what would you change to count vowels instead?"

## Debugging

**Bad**: "Line 7 should be `i < n` instead of `i <= n`."

**Good**: "Let's trace with `n = 3`. What values does `i` take in your loop? And what's the last
valid index of the array?"
