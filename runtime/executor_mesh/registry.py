from __future__ import annotations

from dataclasses import dataclass, field

from .model import ExecutorDescriptor


@dataclass
class ExecutorRegistry:
    _executors: dict[str, ExecutorDescriptor] = field(default_factory=dict)

    def register(self, descriptor: ExecutorDescriptor) -> None:
        descriptor.validate()
        existing = self._executors.get(descriptor.executor_id)
        if existing is not None and existing != descriptor:
            raise ValueError(f"conflicting executor descriptor: {descriptor.executor_id}")
        self._executors[descriptor.executor_id] = descriptor

    def get(self, executor_id: str) -> ExecutorDescriptor:
        return self._executors[executor_id]

    def all(self) -> tuple[ExecutorDescriptor, ...]:
        return tuple(sorted(self._executors.values(), key=lambda item: item.executor_id))
